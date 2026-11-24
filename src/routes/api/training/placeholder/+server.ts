import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isCollageShape, placeholderCollageImage } from '$lib/server/spotPlaceholder';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

/**
 * Platzhalter-Bild der nächsten Trainingskarte (siehe spotPlaceholder.ts).
 *
 * Ohne Login wie /uploads: Die App lädt Bilder ohne Sitzung, und das Bild
 * besteht nur aus Spot-Fotos, die ohnehin öffentlich unter /uploads liegen.
 * Gerechnet wird höchstens einmal je Bildauswahl und Form; die Adresse
 * selbst bestimmt nichts davon, `k` dient nur dem Browser-Cache.
 */
export const GET: RequestHandler = async ({ url }) => {
	const shape = url.searchParams.get('shape');
	if (!isCollageShape(shape)) throw error(404, 'Not found');

	const img = await placeholderCollageImage(todayYmdInAppTZ(), shape);
	if (!img) throw error(404, 'Not found');

	// Passt der Schlüssel, ändert sich der Inhalt unter dieser Adresse nie.
	const current = url.searchParams.get('k') === img.key;
	return new Response(new Uint8Array(img.data), {
		headers: {
			'content-type': 'image/webp',
			'cache-control': current ? 'public, max-age=2592000, immutable' : 'public, max-age=3600',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
