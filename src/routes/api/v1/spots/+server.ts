import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildSpotsListPayload } from '$lib/server/spotsListPayload';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json(buildSpotsListPayload());
};
