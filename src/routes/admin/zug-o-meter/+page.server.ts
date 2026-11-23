import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { zugkraftPreview } from '$lib/server/zugkraft';

/** Admin-Vorschau: alle sechs Stufen des Zug-O-Meters untereinander. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/');
	return { levels: zugkraftPreview() };
};
