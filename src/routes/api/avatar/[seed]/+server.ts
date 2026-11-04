import type { RequestHandler } from './$types';
import { identiconSvg } from '$lib/server/identicon';

/**
 * Generierter Fallback-Avatar für eine Person ohne eigenes Profilbild.
 * Seed ist üblicherweise der Benutzername — gleicher Name, gleiches Bild.
 * Öffentlich und lange cachebar: das Muster ändert sich nie.
 */
export const GET: RequestHandler = async ({ params }) => {
	const seed = decodeURIComponent(params.seed ?? '?').slice(0, 64);
	const svg = identiconSvg(seed);
	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
