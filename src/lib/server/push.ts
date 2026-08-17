/**
 * Web-Push-Versand (VAPID). Ein Abo pro Gerät liegt in `push_subscriptions`.
 *
 * Nötige Umgebungsvariablen (siehe README):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… oder https://…)
 * Fehlen sie, ist Push schlicht deaktiviert — die App läuft normal weiter.
 */
import webpush from 'web-push';
import { createHmac, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { pushSubscriptions, fcmTokens, users } from './db/schema';
import { parsePushPrefs, type PushPrefs } from '$lib/pushPrefs';
import { usersNotDeletedCondition } from './usersWhere';

/** Ab so vielen Fehlversuchen in Folge gilt ein Abo als tot und wird gelöscht. */
const MAX_FAILURES = 5;

let configured: boolean | null = null;

export function getVapidPublicKey(): string {
	return process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
}

/** true, sobald gültige VAPID-Schlüssel gesetzt sind. Ergebnis wird gecacht. */
export function isPushConfigured(): boolean {
	if (configured !== null) return configured;
	const publicKey = getVapidPublicKey();
	const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
	const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@localhost';
	if (!publicKey || !privateKey) {
		configured = false;
		return configured;
	}
	try {
		webpush.setVapidDetails(subject, publicKey, privateKey);
		configured = true;
	} catch (err) {
		console.error('[push] VAPID-Konfiguration ungültig:', err);
		configured = false;
	}
	return configured;
}

export type PushPayload = {
	title: string;
	body: string;
	/** Pfad, der beim Antippen geöffnet wird, z. B. `/training`. */
	url?: string;
	/** Gleiche Tags ersetzen einander auf dem Gerät statt sich zu stapeln. */
	tag?: string;
};

type SubscriptionRow = {
	id: number;
	endpoint: string;
	p256dh: string;
	auth: string;
};

async function deliver(sub: SubscriptionRow, payload: PushPayload): Promise<boolean> {
	try {
		await webpush.sendNotification(
			{
				endpoint: sub.endpoint,
				keys: { p256dh: sub.p256dh, auth: sub.auth }
			},
			JSON.stringify(payload),
			{
				TTL: 60 * 60 * 12,
				// Weckt Android auch im Stromsparmodus (Doze) — mit normaler
				// Priorität werden Nachrichten dort verzögert oder verworfen.
				urgency: 'high'
			}
		);
		db.update(pushSubscriptions)
			.set({ failureCount: 0, lastSuccessAt: sql`(datetime('now'))` })
			.where(eq(pushSubscriptions.id, sub.id))
			.run();
		return true;
	} catch (err) {
		const status = (err as { statusCode?: number }).statusCode;
		// 404/410: Abo beim Push-Dienst abgemeldet — sofort entfernen.
		if (status === 404 || status === 410) {
			db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
			return false;
		}
		const row = db
			.select({ failureCount: pushSubscriptions.failureCount })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.id, sub.id))
			.get();
		const next = (row?.failureCount ?? 0) + 1;
		if (next >= MAX_FAILURES) {
			db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
		} else {
			db.update(pushSubscriptions)
				.set({ failureCount: next })
				.where(eq(pushSubscriptions.id, sub.id))
				.run();
		}
		console.error(`[push] Zustellung fehlgeschlagen (${status ?? 'kein Status'}):`, err);
		return false;
	}
}

/**
 * Google-freier Push-Kanal über ntfy (Open Source): Jeder User hat ein
 * geheimes, aus der User-ID abgeleitetes Thema. Wer in der ntfy-App das
 * eigene Thema abonniert hat, bekommt jede Portal-Benachrichtigung auch
 * bei geschlossener App — ganz ohne Google/Firebase.
 * Server per NTFY_BASE umstellbar (Standard: ntfy.sh; später self-hosted).
 */
const NTFY_BASE = (process.env.NTFY_BASE || 'https://ntfy.sh').replace(/\/$/, '');
const PORTAL_ORIGIN = process.env.ORIGIN || 'https://matetraining.duckdns.org';

export function ntfyTopicForUser(userId: number): string {
	const secret = process.env.JWT_SECRET || 'parkour';
	const mac = createHmac('sha256', secret).update(`ntfy:${userId}`).digest('hex');
	return `mate-${mac.slice(0, 20)}`;
}

export function ntfyInfoForUser(userId: number): { base: string; topic: string; url: string } {
	const topic = ntfyTopicForUser(userId);
	return { base: NTFY_BASE, topic, url: `${NTFY_BASE}/${topic}` };
}

async function deliverNtfy(userId: number, payload: PushPayload): Promise<boolean> {
	try {
		const res = await fetch(`${NTFY_BASE}/${ntfyTopicForUser(userId)}`, {
			method: 'POST',
			headers: {
				'X-Title': payload.title,
				'X-Click': `${PORTAL_ORIGIN}${payload.url ?? '/'}`,
				...(payload.tag ? { 'X-Tags': payload.tag } : {})
			},
			body: payload.body
		});
		return res.ok;
	} catch {
		return false; // ntfy nicht erreichbar — Web-Push läuft unabhängig weiter.
	}
}

/**
 * Kanal 3: Firebase Cloud Messaging — weckt die native App auch, wenn sie
 * komplett geschlossen ist. Dienstkonto-Schlüssel liegt ausserhalb des Repos
 * (FCM_SERVICE_ACCOUNT oder backups/firebase/service-account*.json).
 * Fehlt er, ist der Kanal einfach aus — alles andere läuft weiter.
 */
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let fcmAccount: ServiceAccount | null | undefined;
let fcmToken: { value: string; expiresAt: number } | null = null;

function loadFcmAccount(): ServiceAccount | null {
	if (fcmAccount !== undefined) return fcmAccount;
	const candidates = [
		process.env.FCM_SERVICE_ACCOUNT,
		join(process.cwd(), 'backups', 'firebase', 'service-account.json'),
		join(process.cwd(), 'backups', 'firebase', 'parkour-portal-firebase-adminsdk-fbsvc-8a53a7ccc8.json')
	].filter((p): p is string => Boolean(p));
	for (const p of candidates) {
		try {
			const parsed = JSON.parse(readFileSync(p, 'utf8')) as ServiceAccount;
			if (parsed.project_id && parsed.client_email && parsed.private_key) {
				fcmAccount = parsed;
				return parsed;
			}
		} catch {
			/* nächsten Kandidaten versuchen */
		}
	}
	fcmAccount = null;
	return null;
}

/** OAuth2-Zugangstoken aus dem Dienstkonto (RS256-JWT), ~55 min gecacht. */
async function getFcmAccessToken(): Promise<string | null> {
	const acc = loadFcmAccount();
	if (!acc) return null;
	if (fcmToken && fcmToken.expiresAt > Date.now()) return fcmToken.value;
	const now = Math.floor(Date.now() / 1000);
	const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
		iss: acc.client_email,
		scope: 'https://www.googleapis.com/auth/firebase.messaging',
		aud: 'https://oauth2.googleapis.com/token',
		iat: now,
		exp: now + 3600
	})}`;
	const signature = createSign('RSA-SHA256').update(unsigned).sign(acc.private_key, 'base64url');
	try {
		const res = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${signature}`
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { access_token: string; expires_in: number };
		fcmToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
		return fcmToken.value;
	} catch {
		return null;
	}
}

async function deliverFcm(userIds: number[], payload: PushPayload): Promise<number> {
	const acc = loadFcmAccount();
	if (!acc) return 0;
	let rows: { id: number; token: string; failureCount: number }[] = [];
	try {
		rows = db
			.select({ id: fcmTokens.id, token: fcmTokens.token, failureCount: fcmTokens.failureCount })
			.from(fcmTokens)
			.where(inArray(fcmTokens.userId, userIds))
			.all();
	} catch {
		return 0; // Migration 0023 fehlt noch — Kanal bleibt still.
	}
	if (rows.length === 0) return 0;
	const access = await getFcmAccessToken();
	if (!access) return 0;
	const results = await Promise.all(
		rows.map(async (row) => {
			try {
				const res = await fetch(
					`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`,
					{
						method: 'POST',
						headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
						body: JSON.stringify({
							message: {
								token: row.token,
								notification: { title: payload.title, body: payload.body },
								data: { url: payload.url ?? '/' },
								android: {
									priority: 'high',
									notification: { channel_id: 'default', ...(payload.tag ? { tag: payload.tag } : {}) }
								}
							}
						})
					}
				);
				if (res.ok) {
					if (row.failureCount > 0)
						db.update(fcmTokens).set({ failureCount: 0 }).where(eq(fcmTokens.id, row.id)).run();
					return true;
				}
				// 404/410 = Token tot (App deinstalliert) → sofort aufräumen.
				if (res.status === 404 || res.status === 410) {
					db.delete(fcmTokens).where(eq(fcmTokens.id, row.id)).run();
				} else {
					const next = row.failureCount + 1;
					if (next >= MAX_FAILURES) db.delete(fcmTokens).where(eq(fcmTokens.id, row.id)).run();
					else db.update(fcmTokens).set({ failureCount: next }).where(eq(fcmTokens.id, row.id)).run();
				}
				return false;
			} catch {
				return false;
			}
		})
	);
	return results.filter(Boolean).length;
}

/** Schickt an alle Geräte der genannten User. Gibt die Zahl erfolgreicher Zustellungen zurück. */
export async function sendToUsers(userIds: number[], payload: PushPayload): Promise<number> {
	if (userIds.length === 0) return 0;

	// Kanal 2: ntfy — unabhängig von der VAPID-Konfiguration.
	const ntfyResults = Promise.all(userIds.map((id) => deliverNtfy(id, payload)));
	// Kanal 3: FCM an die native App (leise aus, solange kein Dienstkonto liegt).
	const fcmResults = deliverFcm(userIds, payload);

	let webCount = 0;
	if (isPushConfigured()) {
		const subs = db
			.select({
				id: pushSubscriptions.id,
				endpoint: pushSubscriptions.endpoint,
				p256dh: pushSubscriptions.p256dh,
				auth: pushSubscriptions.auth
			})
			.from(pushSubscriptions)
			.where(inArray(pushSubscriptions.userId, userIds))
			.all();
		if (subs.length > 0) {
			const results = await Promise.all(subs.map((s) => deliver(s, payload)));
			webCount = results.filter(Boolean).length;
		}
	}
	const ntfyCount = (await ntfyResults).filter(Boolean).length;
	return webCount + ntfyCount + (await fcmResults);
}

/** Geräte-Token der App registrieren (Upsert — Token wandern bei Re-Login mit). */
export function registerFcmToken(userId: number, token: string): void {
	db.insert(fcmTokens)
		.values({ userId, token })
		.onConflictDoUpdate({ target: fcmTokens.token, set: { userId, failureCount: 0 } })
		.run();
}

export function removeFcmToken(token: string): void {
	db.delete(fcmTokens).where(eq(fcmTokens.token, token)).run();
}

/**
 * Wie `sendToUsers`, aber nur an User, die diese Benachrichtigungsart aktiviert
 * haben. `candidateUserIds` grenzt zusätzlich ein (leer = alle aktiven User),
 * `opts.excludeUserIds` nimmt Einzelne aus (z. B. den Auslöser selbst).
 */
export async function sendToUsersWithPref(
	pref: keyof PushPrefs,
	payload: PushPayload,
	candidateUserIds?: number[],
	opts?: { excludeUserIds?: number[] }
): Promise<number> {
	// Kein isPushConfigured-Gate mehr: ntfy funktioniert auch ohne VAPID.
	const rows = db
		.select({ id: users.id, pushPrefs: users.pushPrefs })
		.from(users)
		.where(usersNotDeletedCondition())
		.all();
	const excluded = new Set(opts?.excludeUserIds ?? []);
	const allowed = rows
		.filter((r) => parsePushPrefs(r.pushPrefs)[pref])
		.map((r) => r.id)
		.filter((id) => !candidateUserIds || candidateUserIds.includes(id))
		.filter((id) => !excluded.has(id));
	return sendToUsers(allowed, payload);
}
