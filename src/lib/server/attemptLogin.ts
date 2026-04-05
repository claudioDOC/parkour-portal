import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { userCoreAuth } from '$lib/server/db/userCoreSelect';
import { eq } from 'drizzle-orm';
import { verifyPassword, createSession } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';
import { getClientIp, rateLimitAuthLogin } from '$lib/server/rateLimitAuth';

export type AttemptLoginResult =
	| { kind: 'success'; user: { id: number; username: string; role: string } }
	| { kind: 'error'; status: number; error: string; retryAfterSec?: number };

export async function attemptLogin(
	event: RequestEvent,
	username: unknown,
	password: unknown
): Promise<AttemptLoginResult> {
	const ip = getClientIp(event);
	const limited = rateLimitAuthLogin(ip);
	if (!limited.ok) {
		return {
			kind: 'error',
			status: 429,
			error: 'Zu viele Anmeldeversuche. Bitte kurz warten und erneut versuchen.',
			retryAfterSec: limited.retryAfterSec
		};
	}

	const u = typeof username === 'string' ? username.trim() : String(username ?? '').trim();
	const p = typeof password === 'string' ? password : String(password ?? '');

	if (!u || !p) {
		return { kind: 'error', status: 400, error: 'Username und Passwort erforderlich' };
	}

	const user = db.select(userCoreAuth).from(users).where(eq(users.username, u)).get();
	if (!user) {
		logAudit({
			event,
			action: 'auth.login.failed',
			detail: { username: u, reason: 'unknown_user' }
		});
		return { kind: 'error', status: 401, error: 'Ungültige Anmeldedaten' };
	}

	const valid = await verifyPassword(p, user.passwordHash);
	if (!valid) {
		logAudit({
			event,
			action: 'auth.login.failed',
			detail: { username: user.username, reason: 'bad_password' }
		});
		return { kind: 'error', status: 401, error: 'Ungültige Anmeldedaten' };
	}

	if (user.deleted) {
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
