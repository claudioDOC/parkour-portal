import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getUserCoreById } from '$lib/server/userCoreQuery';
import { eq, sql } from 'drizzle-orm';
import { clearSession, hashPassword, verifyPassword } from '$lib/server/auth';
import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
import { logAudit } from '$lib/server/audit';

export const POST: RequestHandler = async (event) => {
	const { request, locals, cookies } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let body: { currentPassword?: unknown; newPassword?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ungültige Anfrage (kein JSON)' }, { status: 400 });
	}

	const currentPassword =
		typeof body.currentPassword === 'string' ? body.currentPassword : '';
	const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

	if (!currentPassword || !newPassword) {
		return json({ error: 'Aktuelles und neues Passwort erforderlich' }, { status: 400 });
	}

	if (newPassword.length < MIN_PASSWORD_LENGTH) {
		return json(
			{ error: `Neues Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben` },
			{ status: 400 }
		);
	}

	const user = getUserCoreById(locals.user.id);
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
	try {
		db.update(users)
			.set({
				passwordHash: newHash,
				sessionVersion: sql`${users.sessionVersion} + 1`
			})
			.where(eq(users.id, locals.user.id))
			.run();
	} catch (e) {
		console.error('[change-password] DB-Update fehlgeschlagen', e);
		return json(
			{
				error:
					'Speichern fehlgeschlagen. Fehlt die Migration für session_version? (`npm run db:migrate`)'
			},
			{ status: 500 }
		);
	}

	clearSession(cookies);

	logAudit({
		event,
		action: 'auth.password_change',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username
	});

	return json({ success: true, loggedOut: true });
};
