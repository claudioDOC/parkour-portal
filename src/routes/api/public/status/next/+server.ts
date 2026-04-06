import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertPublicStatusApiKey } from '$lib/server/publicApiAuth';
import { getPublicTrainingStatus } from '$lib/server/publicTrainingStatus';

export const GET: RequestHandler = async (event) => {
	assertPublicStatusApiKey(event);
	return json(getPublicTrainingStatus('next'));
};
