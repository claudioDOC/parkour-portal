import type { RequestEvent } from '@sveltejs/kit';
import { verifyPassword, createSession } from '$lib/server/auth';
import { getUserCoreByUsername } from '$lib/server/userCoreQuery';
import { logAudit } from '$lib/server/audit';
import {
	getClientIp,
	assertLoginFailuresBelowLimit,
	recordLoginAuthFailure,
	clearLoginAuthFailures
} from '$lib/server/rateLimitAuth';

export type AttemptLoginResult =
	| { kind: 'success'; user: { id: number; username: string; role: string } }
	| { kind: 'error'; status: number; error: string; retryAfterSec?: number };

export async function attemptLogin(
	event: RequestEvent,
	username: unknown,
	password: unknown
): Promise<AttemptLoginResult> {
	const ip = getClientIp(event);
	const limited = assertLoginFailuresBelowLimit(ip);
	if (!limited.ok) {
		const s = limited.retryAfterSec;
		return {
			kind: 'error',
			status: 429,
			error: `Zu viele fehlgeschlagene Anmeldeversuche. Bitte etwa ${s} Sekunde${s === 1 ? '' : 'n'} warten und erneut versuchen.`,
			retryAfterSec: limited.retryAfterSec
		};
	}

	const u = typeof username === 'string' ? username.trim() : String(username ?? '').trim();
	const p = typeof password === 'string' ? password : String(password ?? '');

	if (!u || !p) {
		return { kind: 'error', status: 400, error: 'Username und Passwort erforderlich' };
	}

	const user = getUserCoreByUsername(u);
	if (!user) {
		recordLoginAuthFailure(ip);
		logAudit({
			event,
			action: 'auth.login.failed',
			detail: { username: u, reason: 'unknown_user' }
		});
		return { kind: 'error', status: 401, error: 'Ungültige Anmeldedaten' };
	}

	const valid = await verifyPassword(p, user.passwordHash);
	if (!valid) {
		recordLoginAuthFailure(ip);
		logAudit({
			event,
			action: 'auth.login.failed',
			detail: { username: user.username, reason: 'bad_password' }
		});
		return { kind: 'error', status: 401, error: 'Ungültige Anmeldedaten' };
	}

	if (user.deleted) {
		recordLoginAuthFailure(ip);
		logAudit({
			event,
			action: 'auth.login.failed',
			actorUserId: user.id,
			actorUsername: user.username,
			detail: { reason: 'trashed' }
		});
		return { kind: 'error', status: 403, error: 'Dieser Account ist nicht mehr verfügbar.' };
	}

	if (!user.active) {
		recordLoginAuthFailure(ip);
		logAudit({
			event,
			action: 'auth.login.failed',
			actorUserId: user.id,
			actorUsername: user.username,
			detail: { reason: 'inactive' }
		});
		return {
			kind: 'error',
			status: 403,
			error: 'Dein Account wurde deaktiviert. Kontaktiere einen Admin.'
		};
	}

	clearLoginAuthFailures(ip);
	createSession(user, event.cookies);
	logAudit({
		event,
		action: 'auth.login.success',
		actorUserId: user.id,
		actorUsername: user.username,
		detail: { role: user.role }
	});

	return {
		kind: 'success',
		user: { id: user.id, username: user.username, role: user.role }
	};
}
