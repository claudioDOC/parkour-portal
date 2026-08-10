import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushSubscriptions, users } from '$lib/server/db/schema';
import { getVapidPublicKey, isPushConfigured } from '$lib/server/push';
import { parsePushPrefs, sanitizePushPrefs, DEFAULT_PUSH_PREFS } from '$lib/pushPrefs';

/** Grobe Gerätebeschreibung aus dem User-Agent — nur zur Wiedererkennung. */
function describeDevice(ua: string | null): string {
	if (!ua) return 'Unbekanntes Gerät';
	const browser = /firefox/i.test(ua)
		? 'Firefox'
		: /edg/i.test(ua)
			? 'Edge'
			: /chrome|crios/i.test(ua)
				? 'Chrome'
				: /safari/i.test(ua)
					? 'Safari'
					: 'Browser';
	const os = /android/i.test(ua)
		? 'Android'
		: /iphone|ipad|ipod/i.test(ua)
			? 'iPhone/iPad'
			: /windows/i.test(ua)
				? 'Windows'
				: /mac os/i.test(ua)
					? 'Mac'
					: /linux|x11/i.test(ua)
						? 'Linux'
						: '';
	return os ? `${browser} auf ${os}` : browser;
}

function readPrefs(userId: number) {
	try {
		const row = db
			.select({ pushPrefs: users.pushPrefs })
			.from(users)
			.where(eq(users.id, userId))
			.get();
		return parsePushPrefs(row?.pushPrefs);
	} catch {
		// Spalte fehlt (Migration noch nicht gelaufen) — Defaults sind unkritisch.
		return { ...DEFAULT_PUSH_PREFS };
	}
}

/** Öffentlicher VAPID-Key, Einstellungen und registrierte Geräte des Users. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let devices: { id: number; label: string; since: string }[] = [];
	try {
		devices = db
			.select({
				id: pushSubscriptions.id,
				userAgent: pushSubscriptions.userAgent,
				createdAt: pushSubscriptions.createdAt
			})
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, locals.user.id))
			.all()
			.map((d) => ({ id: d.id, label: describeDevice(d.userAgent), since: d.createdAt }));
	} catch {
		// Tabelle fehlt (Migration ausstehend) — Liste bleibt leer.
	}

	return json({
		enabled: isPushConfigured(),
		publicKey: getVapidPublicKey(),
		prefs: readPrefs(locals.user.id),
		devices
	});
};

/** Einstellungen ändern; unbekannte Schlüssel werden ignoriert. */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}

	const current = readPrefs(locals.user.id);
	const next = sanitizePushPrefs((body as { prefs?: unknown })?.prefs ?? body, current);

	try {
		db.update(users)
			.set({ pushPrefs: JSON.stringify(next) })
			.where(eq(users.id, locals.user.id))
			.run();
	} catch {
		throw error(500, 'Einstellungen konnten nicht gespeichert werden (Migration ausstehend?)');
	}

	return json({ ok: true, prefs: next });
};
