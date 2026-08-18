import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendToUsers, lastPushChannels } from '$lib/server/push';

/** Testbenachrichtigung an alle eigenen Geräte — zum Prüfen der Einrichtung. */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const sent = await sendToUsers([locals.user.id], {
		title: 'Parkour Portal',
		body: 'Test — Benachrichtigungen funktionieren.',
		url: '/settings',
		tag: 'push-test'
	});

	// Aufschlüsselung: Browser-Push, ntfy und die native App getrennt.
	return json({ ok: true, sent, channels: lastPushChannels() });
};
