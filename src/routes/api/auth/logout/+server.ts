import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession, getRawToken, getSession, getSessionFromCookiesOrBearer } from '$lib/server/auth';
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
	const session = getSessionFromCookiesOrBearer(event.cookies, event.request) ?? getSession(event.cookies);
	const raw = getRawToken(event.cookies, event.request);
	if (session && raw) {
		revokeToken(raw, session.userId, session.exp);
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
