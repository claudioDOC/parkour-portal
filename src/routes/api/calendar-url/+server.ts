import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Kalender-Abo-Link inklusive Schlüssel — die App hatte den Link bisher
 * ohne `?key=` geteilt, was beim Abonnieren zu „Unauthorized" führte.
 * Gleiche Logik wie die Einstellungsseite im Web.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const raw = process.env.PUBLIC_STATUS_API_KEYS ?? process.env.PUBLIC_STATUS_API_KEY ?? '';
	const key = raw.split(',')[0]?.trim() ?? '';
	const origin = (process.env.ORIGIN ?? url.origin).replace(/\/$/, '');
	const calendarUrl = key ? `${origin}/calendar.ics?key=${encodeURIComponent(key)}` : null;
	return json({ calendarUrl });
};
