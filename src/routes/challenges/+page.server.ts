import type { PageServerLoad } from './$types';
import { buildChallengesArenaPayload } from '$lib/server/challengesArenaPayload';

export const load: PageServerLoad = async ({ locals }) => {
	const viewerUsername = locals.user?.username ?? null;
	return buildChallengesArenaPayload(viewerUsername);
};
