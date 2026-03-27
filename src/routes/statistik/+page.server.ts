import type { PageServerLoad } from './$types';
import { computeTrainingStats } from '$lib/server/stats';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		stats: computeTrainingStats()
	};
};
