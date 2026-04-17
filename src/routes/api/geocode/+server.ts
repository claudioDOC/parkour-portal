import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Ortsuche für Trip-Karte (Server-Proxy: Nominatim verlangt sinnvollen User-Agent).
 * Optional: PARKOUR_NOMINATIM_USER_AGENT (z. B. Kontakt-URL laut OSM-Richtlinien).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const q = (url.searchParams.get('q') || '').trim();
	if (q.length < 2) {
		return json({ error: 'Suchbegriff zu kurz' }, { status: 400 });
	}

	const userAgent =
		process.env.PARKOUR_NOMINATIM_USER_AGENT?.trim() ||
		'ParkourPortal/1.0 (https://github.com/)';

	const params = new URLSearchParams({
		q,
		format: 'json',
		limit: '5',
		addressdetails: '0'
	});

	let res: Response;
	try {
		res = await fetch(`${NOMINATIM}?${params}`, {
			headers: {
				'User-Agent': userAgent,
				Accept: 'application/json',
				'Accept-Language': 'de'
			}
		});
	} catch {
		return json({ error: 'Geocoding-Dienst nicht erreichbar' }, { status: 502 });
	}

	if (!res.ok) {
		return json({ error: 'Geocoding fehlgeschlagen' }, { status: 502 });
	}

	type NRow = { lat: string; lon: string; display_name: string };
	const raw = (await res.json()) as NRow[];
	const results = raw.map((r) => ({
		lat: Number(r.lat),
		lon: Number(r.lon),
		displayName: r.display_name
	}));

	return json({
		results: results.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
	});
};
