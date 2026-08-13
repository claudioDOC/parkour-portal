import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeed, markSeen } from '$lib/server/activity';

/** Feed + Zahl der ungelesenen Ereignisse (für Glocke und roten Punkt). */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json(getFeed(locals.user.id));
};

/** Als gelesen markieren (Glocke geöffnet). */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	let body: { eventId?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}
	const eventId = Number(body.eventId);
	if (!Number.isFinite(eventId) || eventId < 0) throw error(400, 'eventId fehlt');
	markSeen(locals.user.id, eventId);
	return json({ ok: true });
};
