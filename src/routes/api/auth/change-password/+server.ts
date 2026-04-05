import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { userCoreAuth } from '$lib/server/db/userCoreSelect';
import { eq, sql } from 'drizzle-orm';
import { createSession, hashPassword, verifyPassword } from '$lib/server/auth';
import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
import { logAudit } from '$lib/server/audit';

export const POST: RequestHandler = async (event) => {
	const { request, locals, cookies } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { currentPassword, newPassword } = await request.json();

	if (!currentPassword || !newPassword) {
		return json({ error: 'Aktuelles und neues Passwort erforderlich' }, { status: 400 });
	}

	if (newPassword.length < MIN_PASSWORD_LENGTH) {
		return json(
			{ error: `Neues Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` },
			{ status: 400 }
		);
	}

	const user = db.select(userCoreAuth).from(users).where(eq(users.id, locals.user.id)).get();
	if (!user) throw error(404, 'User nicht gefunden');

	const valid = await verifyPassword(currentPassword, user.passwordHash);
	if (!valid) {
		logAudit({
			event,
			action: 'auth.password_change.failed',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { reason: 'wrong_current' }
		});
		return json({ error: 'Aktuelles Passwort ist falsch' }, { status: 403 });
	}

	const newHash = await hashPassword(newPassword);
	db.update(users)
		.set({
			passwordHash: newHash,
			sessionVersion: sql`${users.sessionVersion} + 1`
		})
		.where(eq(users.id, locals.user.id))
		.run();

	const fresh = db
		.select({
			sessionVersion: users.sessionVersion,
			username: users.username,
			role: users.role
		})
		.from(users)
		.where(eq(users.id, locals.user.id))
		.get();
	if (fresh) {
		createSession(
			{
				id: locals.user.id,
				username: fresh.username,
				role: fresh.role,
				sessionVersion: fresh.sessionVersion
			},
			cookies
		);
	}

	logAudit({
		event,
		action: 'auth.password_change',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username
	});

	return json({ success: true });
};
