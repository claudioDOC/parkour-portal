import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession, getVerifiedSession } from '$lib/server/auth';
import { revokeToken } from '$lib/server/revokedTokens';
import { logAudit } from '$lib/server/audit';

/**
 * Abmelden.
 *
 * Das Cookie zu löschen reicht nicht: Wer das Token vorher abgegriffen hat
 * (oder die App, die es im Speicher hält), könnte es sonst bis zum Ablauf
 * weiterverwenden. Darum wird genau dieses Token entwertet — die übrigen
 * Geräte bleiben angemeldet. Wer alles abmelden will, nimmt
 * `/api/auth/logout-all`.
 */
export const POST: RequestHandler = async (event) => {
	const verified = getVerifiedSession(event.cookies, event.request);
	const session = verified?.payload ?? null;
	if (verified) {
		revokeToken(verified.raw, verified.payload.userId, verified.payload.exp);
	}
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
