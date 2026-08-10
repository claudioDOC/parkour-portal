import type { PageServerLoad } from './$types';

/**
 * Baut den Kalender-Abo-Link (Origin + erster PUBLIC_STATUS_API_KEY).
 * Ohne Schlüssel gibt es keinen Link — die Karte bleibt dann versteckt.
 */
export const load: PageServerLoad = async () => {
	const raw = process.env.PUBLIC_STATUS_API_KEYS ?? process.env.PUBLIC_STATUS_API_KEY ?? '';
	const key = raw.split(',')[0]?.trim() ?? '';
	const origin = (process.env.ORIGIN ?? '').replace(/\/$/, '');
	const calendarUrl = key && origin ? `${origin}/calendar.ics?key=${encodeURIComponent(key)}` : null;
	return { calendarUrl };
};
