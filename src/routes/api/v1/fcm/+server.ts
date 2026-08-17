import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registerFcmToken, removeFcmToken } from '$lib/server/push';

/** Die native App meldet hier ihr Firebase-Geräte-Token an/ab. */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const body = (await request.json().catch(() => ({}))) as { token?: string };
	const token = String(body?.token || '').trim();
	if (!token || token.length > 4096) throw error(400, 'Token fehlt oder ungültig');
	try {
		registerFcmToken(locals.user.id, token);
	} catch {
		throw error(503, 'Migration 0023 (fcm_tokens) fehlt auf der Server-DB');
	}
	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const body = (await request.json().catch(() => ({}))) as { token?: string };
	const token = String(body?.token || '').trim();
	if (token) {
		try {
			removeFcmToken(token);
		} catch {
			/* Tabelle fehlt — nichts zu löschen */
		}
	}
	return json({ success: true });
};
