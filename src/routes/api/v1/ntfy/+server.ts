import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ntfyInfoForUser } from '$lib/server/push';

/**
 * Google-freier Push für die App: liefert dem eingeloggten User seinen
 * geheimen ntfy-Kanal. Die App zeigt daraus die Einrichtung
 * (ntfy-App installieren → Kanal abonnieren).
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json(ntfyInfoForUser(locals.user.id));
};
