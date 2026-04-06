import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertPublicStatusApiKey } from '$lib/server/publicApiAuth';
import { getPublicStats } from '$lib/server/publicStats';

export const GET: RequestHandler = async (event) => {
	assertPublicStatusApiKey(event);
	return json(getPublicStats());
};
