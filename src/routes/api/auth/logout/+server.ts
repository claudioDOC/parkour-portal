import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	return json({ success: true });
};
