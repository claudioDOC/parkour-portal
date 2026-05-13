import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { buildSpotDetailPayload } from '$lib/server/spotDetailPayload';

export const load: PageServerLoad = async ({ params, locals }) => {
	const spotId = parseInt(params.id);
	if (Number.isNaN(spotId)) {
		throw error(404, 'Spot nicht gefunden');
	}

	const payload = buildSpotDetailPayload(spotId, locals.user?.id ?? null);
	if (!payload) {
		throw error(404, 'Spot nicht gefunden');
	}

	return {
		...payload,
		user: locals.user
	};
};
