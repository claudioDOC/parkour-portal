import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession, getSession } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';

export const POST: RequestHandler = async (event) => {
	const session = getSession(event.cookies);
	if (session) {
		logAudit({
			event,
			action: 'auth.logout',
			actorUserId: session.userId,
			actorUsername: session.username
		});
	}
	clearSession(event.cookies);
	return json({ success: true });
};
