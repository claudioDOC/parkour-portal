import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';
import { isPushConfigured } from '$lib/server/push';

/** Legt das Abo dieses Geräts an oder schreibt es auf den aktuellen User um. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isPushConfigured()) throw error(503, 'Push ist auf dem Server nicht konfiguriert');

	let body: {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
	};
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}

	const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
	const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
	const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';
	if (!endpoint || !p256dh || !auth) throw error(400, 'Abo unvollständig');
	if (endpoint.length > 2000) throw error(400, 'Endpoint zu lang');

	const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null;

	// Dasselbe Gerät kann vorher einem anderen User gehört haben (Gerät geteilt,
	// User gewechselt) — Abo dann übernehmen statt doppelt anlegen.
	const existing = db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.endpoint, endpoint))
		.get();

	if (existing) {
		db.update(pushSubscriptions)
			.set({
				userId: locals.user.id,
				p256dh,
				auth,
				userAgent,
				failureCount: 0,
				lastSuccessAt: sql`(datetime('now'))`
			})
			.where(eq(pushSubscriptions.id, existing.id))
			.run();
		return json({ ok: true, updated: true });
	}

	db.insert(pushSubscriptions)
		.values({ userId: locals.user.id, endpoint, p256dh, auth, userAgent })
		.run();

	return json({ ok: true, created: true });
};
