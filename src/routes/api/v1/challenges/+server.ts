import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildChallengesArenaPayload } from '$lib/server/challengesArenaPayload';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const viewerUsername = locals.user.username ?? null;
	return json(buildChallengesArenaPayload(viewerUsername));
};
