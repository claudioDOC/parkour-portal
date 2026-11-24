import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { zugAlarmFor } from '$lib/server/zugkraft';

/**
 * Roter Bildschirmrahmen bei „Katastrophe" — für die App. Winzige Antwort,
 * damit sie überall (nicht nur auf der Startseite) nachfragen kann. Das Web
 * bekommt dasselbe über das Root-Layout.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json({ alarm: zugAlarmFor(locals.user) });
};
