import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { buildTripsPagePayload } from '$lib/server/tripsPagePayload';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return buildTripsPagePayload(locals.user);
};
