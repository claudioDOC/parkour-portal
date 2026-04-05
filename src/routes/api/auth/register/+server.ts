import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, invites } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword, createSession } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';
import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
import { getClientIp, rateLimitAuthRegister } from '$lib/server/rateLimitAuth';

export const POST: RequestHandler = async (event) => {
	const ip = getClientIp(event);
	const limited = rateLimitAuthRegister(ip);
	if (!limited.ok) {
		return json(
			{ error: 'Zu viele Registrierungsversuche von dieser Verbindung. Bitte später erneut versuchen.' },
			{ status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
		);
	}

	const { request, cookies } = event;
	const { username, password, token } = await request.json();

	if (!username || !password || !token) {
		return json({ error: 'Alle Felder sind erforderlich' }, { status: 400 });
	}

	if (username.length < 3) {
		return json({ error: 'Username muss mindestens 3 Zeichen lang sein' }, { status: 400 });
	}

	if (password.length < MIN_PASSWORD_LENGTH) {
		return json(
			{ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein` },
			{ status: 400 }
		);
	}

	const invite = db.select().from(invites)
		.where(and(eq(invites.token, token), eq(invites.used, false)))
		.get();

	if (!invite) {
		return json({ error: 'Ungültiger oder bereits verwendeter Einladungslink' }, { status: 400 });
	}

	const now = new Date().toISOString();
	if (invite.expiresAt < now) {
		return json({ error: 'Einladungslink ist abgelaufen' }, { status: 400 });
	}

	const existingUser = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
	if (existingUser) {
		return json({ error: 'Username bereits vergeben' }, { status: 400 });
	}

	const passwordHash = await hashPassword(password);

	const result = db.insert(users).values({
		username,
		passwordHash,
		role: 'member'
	}).returning().get();

	db.update(invites)
		.set({ used: true, usedBy: result.id })
		.where(eq(invites.id, invite.id))
		.run();

	createSession(result, cookies);
	logAudit({
		event,
		action: 'auth.register',
		actorUserId: result.id,
		actorUsername: result.username,
		detail: { inviteId: invite.id }
	});

	return json({ success: true, user: { id: result.id, username: result.username, role: result.role } });
};
