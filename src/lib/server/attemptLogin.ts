import type { RequestEvent } from '@sveltejs/kit';
import { verifyPassword, createSession, signSessionToken } from '$lib/server/auth';
import { getUserCoreByUsername } from '$lib/server/userCoreQuery';
import { logAudit } from '$lib/server/audit';
import { getClientIp, reserveLoginAttempt, clearLoginAuthFailures } from '$lib/server/rateLimitAuth';
import { randomBytes } from 'node:crypto';
import bcryptjs from 'bcryptjs';

/**
 * Vergleichs-Hash für unbekannte Benutzernamen. Ohne ihn antwortete der
 * Login bei unbekannten Namen sofort, bei bekannten erst nach dem
 * bcrypt-Vergleich — an der Antwortzeit liess sich ablesen, welche
 * Benutzernamen es gibt. Jetzt rechnet jeder Versuch gleich lang.
 */
let dummyHash: string | null = null;
function getDummyHash(): string {
	dummyHash ??= bcryptjs.hashSync(randomBytes(18).toString('base64'), 10);
	return dummyHash;
}

export type AttemptLoginResult =
	| { kind: 'success'; user: { id: number; username: string; role: string }; token?: string }
	| { kind: 'error'; status: number; error: string; retryAfterSec?: number };

export async function attemptLogin(
	event: RequestEvent,
	username: unknown,
	password: unknown,
	includeToken?: boolean
): Promise<AttemptLoginResult> {
	const ip = getClientIp(event);

	const u = typeof username === 'string' ? username.trim() : String(username ?? '').trim();
	const p = typeof password === 'string' ? password : String(password ?? '');

	if (!u || !p) {
		return { kind: 'error', status: 400, error: 'Username und Passwort erforderlich' };
	}

	// Platz belegen, bevor irgendetwas gerechnet wird (siehe reserveLoginAttempt).
	const limited = reserveLoginAttempt(ip, u);
	if (!limited.ok) {
		const s = limited.retryAfterSec;
		return {
			kind: 'error',
			status: 429,
			error: `Zu viele fehlgeschlagene Anmeldeversuche. Bitte etwa ${s} Sekunde${s === 1 ? '' : 'n'} warten und erneut versuchen.`,
			retryAfterSec: limited.retryAfterSec
		};
	}

	const user = getUserCoreByUsername(u);
	if (!user) {
		await bcryptjs.compare(p, getDummyHash());
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

	clearLoginAuthFailures(ip, u);
	createSession(user, event.cookies);
	const token = includeToken ? signSessionToken(user) : undefined;
	logAudit({
		event,
		action: 'auth.login.success',
		actorUserId: user.id,
		actorUsername: user.username,
		detail: { role: user.role }
	});

	return {
		kind: 'success',
		user: { id: user.id, username: user.username, role: user.role },
		...(token ? { token } : {})
	};
}
