import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildTrainingSessionsCompactPayload } from '$lib/server/trainingSessionsCompactPayload';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json(buildTrainingSessionsCompactPayload());
};
