import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { userCoreAuth } from '$lib/server/db/userCoreSelect';
import { eq } from 'drizzle-orm';
import { verifyPassword, createSession } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';
import { getClientIp, rateLimitAuthLogin } from '$lib/server/rateLimitAuth';

export const POST: RequestHandler = async (event) => {
	const ip = getClientIp(event);
	const limited = rateLimitAuthLogin(ip);
	if (!limited.ok) {
		return json(
			{ error: 'Zu viele Anmeldeversuche. Bitte kurz warten und erneut versuchen.' },
			{ status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
		);
	}

	const { request, cookies } = event;
	const { username, password } = await request.json();

	if (!username || !password) {
		return json({ error: 'Username und Passwort erforderlich' }, { status: 400 });
	}

	const user = db.select(userCoreAuth).from(users).where(eq(users.username, username)).get();
	if (!user) {
		logAudit({
			event,
			action: 'auth.login.failed',
			detail: { username: String(username), reason: 'unknown_user' }
		});
		return json({ error: 'Ungültige Anmeldedaten' }, { status: 401 });
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		logAudit({
			event,
			action: 'auth.login.failed',
			detail: { username: user.username, reason: 'bad_password' }
		});
		return json({ error: 'Ungültige Anmeldedaten' }, { status: 401 });
	}

	if (user.deleted) {
		logAudit({
			event,
			action: 'auth.login.failed',
			actorUserId: user.id,
			actorUsername: user.username,
			detail: { reason: 'trashed' }
		});
		return json({ error: 'Dieser Account ist nicht mehr verfügbar.' }, { status: 403 });
	}

	if (!user.active) {
		logAudit({
			event,
			action: 'auth.login.failed',
			actorUserId: user.id,
			actorUsername: user.username,
			detail: { reason: 'inactive' }
		});
		return json({ error: 'Dein Account wurde deaktiviert. Kontaktiere einen Admin.' }, { status: 403 });
	}

	createSession(user, cookies);
	logAudit({
		event,
		action: 'auth.login.success',
		actorUserId: user.id,
		actorUsername: user.username,
		detail: { role: user.role }
	});

	return json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
};
