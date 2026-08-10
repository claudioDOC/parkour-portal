import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendToUsers, isPushConfigured } from '$lib/server/push';

/** Testbenachrichtigung an alle eigenen Geräte — zum Prüfen der Einrichtung. */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isPushConfigured()) throw error(503, 'Push ist auf dem Server nicht konfiguriert');

	const sent = await sendToUsers([locals.user.id], {
		title: 'Parkour Portal',
		body: 'Test — Benachrichtigungen funktionieren.',
		url: '/settings',
		tag: 'push-test'
	});

	return json({ ok: true, sent });
};
