import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const query = url.searchParams.get('q');
	if (!query || query.length < 3) {
		return json({ results: [] });
	}

	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/search?` +
			`q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=ch&addressdetails=1`,
			{
				headers: {
					'User-Agent': 'ParkourPortal/1.0 (parkour-group-tool)'
				}
			}
		);

		if (!res.ok) {
			return json({ results: [] });
		}

		const data = await res.json();

		const results = data.map((item: any) => ({
			displayName: item.display_name,
			lat: parseFloat(item.lat),
			lon: parseFloat(item.lon),
			city: item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || ''
		}));

		return json({ results });
	} catch {
		return json({ results: [] });
	}
};
