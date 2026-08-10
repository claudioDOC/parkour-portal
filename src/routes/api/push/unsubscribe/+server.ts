import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';

/** Entfernt das Abo dieses Geräts. Fremde Abos bleiben unberührt. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let body: { endpoint?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}
	const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
	if (!endpoint) throw error(400, 'Endpoint fehlt');

	db.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.endpoint, endpoint),
				eq(pushSubscriptions.userId, locals.user.id)
			)
		)
		.run();

	return json({ ok: true });
};
