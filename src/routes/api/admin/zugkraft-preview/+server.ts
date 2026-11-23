import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { zugkraftPreview } from '$lib/server/zugkraft';

/** Alle sechs Zug-O-Meter-Stufen als Muster — für die Vorschau in der App. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Nur Admin');
	return json({ levels: zugkraftPreview() });
};
