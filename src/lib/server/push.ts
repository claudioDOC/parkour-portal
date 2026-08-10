/**
 * Web-Push-Versand (VAPID). Ein Abo pro Gerät liegt in `push_subscriptions`.
 *
 * Nötige Umgebungsvariablen (siehe README):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… oder https://…)
 * Fehlen sie, ist Push schlicht deaktiviert — die App läuft normal weiter.
 */
import webpush from 'web-push';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { pushSubscriptions, users } from './db/schema';
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
			{ TTL: 60 * 60 * 12 }
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

/** Schickt an alle Geräte der genannten User. Gibt die Zahl erfolgreicher Zustellungen zurück. */
export async function sendToUsers(userIds: number[], payload: PushPayload): Promise<number> {
	if (!isPushConfigured() || userIds.length === 0) return 0;
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
	if (subs.length === 0) return 0;
	const results = await Promise.all(subs.map((s) => deliver(s, payload)));
	return results.filter(Boolean).length;
}

/**
 * Wie `sendToUsers`, aber nur an User, die diese Benachrichtigungsart aktiviert
 * haben. `candidateUserIds` grenzt zusätzlich ein (leer = alle aktiven User).
 */
export async function sendToUsersWithPref(
	pref: keyof PushPrefs,
	payload: PushPayload,
	candidateUserIds?: number[]
): Promise<number> {
	if (!isPushConfigured()) return 0;
	const rows = db
		.select({ id: users.id, pushPrefs: users.pushPrefs })
		.from(users)
		.where(usersNotDeletedCondition())
		.all();
	const allowed = rows
		.filter((r) => parsePushPrefs(r.pushPrefs)[pref])
		.map((r) => r.id)
		.filter((id) => !candidateUserIds || candidateUserIds.includes(id));
	return sendToUsers(allowed, payload);
}
