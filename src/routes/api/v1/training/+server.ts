import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildTrainingPagePayload } from '$lib/server/trainingPagePayload';

/** Voller Training-Payload (identisch zur Web-Seite) für mobile Clients. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	return json(await buildTrainingPagePayload(locals.user));
};
