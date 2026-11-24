import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { calendarUrlFor } from '$lib/server/calendarFeed';

/**
 * Persönlicher Kalender-Abo-Link für die App — gleiche Logik wie die
 * Einstellungsseite im Web (siehe calendarFeed.ts).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const calendarUrl = calendarUrlFor(locals.user.id, process.env.ORIGIN ?? url.origin);
	return json({ calendarUrl });
};
