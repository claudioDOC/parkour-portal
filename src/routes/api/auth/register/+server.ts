import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registerWithInvite } from '$lib/server/registerWithInvite';

export const POST: RequestHandler = async (event) => {
	const { username, password, token } = await event.request.json();

	const result = await registerWithInvite(event, username, password, token);

	if (result.kind === 'error') {
		const headers: Record<string, string> = {};
		if (result.status === 429 && result.retryAfterSec != null) {
			headers['Retry-After'] = String(result.retryAfterSec);
		}
		return json({ error: result.error }, { status: result.status, headers });
	}

	return json({ success: true, user: result.user });
};
