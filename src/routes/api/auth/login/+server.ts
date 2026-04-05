import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { attemptLogin } from '$lib/server/attemptLogin';

export const POST: RequestHandler = async (event) => {
	let body: { username?: unknown; password?: unknown } = {};
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Ungültige Anfrage' }, { status: 400 });
	}

	const result = await attemptLogin(event, body.username, body.password);
	if (result.kind === 'success') {
		return json({ success: true, user: result.user });
	}

	const headers: Record<string, string> = {};
	if (result.status === 429 && result.retryAfterSec != null) {
		headers['Retry-After'] = String(result.retryAfterSec);
	}

	return json({ error: result.error }, { status: result.status, headers });
};
