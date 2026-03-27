import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { currentPassword, newPassword } = await request.json();

	if (!currentPassword || !newPassword) {
		return json({ error: 'Aktuelles und neues Passwort erforderlich' }, { status: 400 });
	}

	if (newPassword.length < 4) {
		return json({ error: 'Neues Passwort muss mindestens 4 Zeichen haben' }, { status: 400 });
	}

	const user = db.select().from(users).where(eq(users.id, locals.user.id)).get();
	if (!user) throw error(404, 'User nicht gefunden');

	const valid = await verifyPassword(currentPassword, user.passwordHash);
	if (!valid) {
		return json({ error: 'Aktuelles Passwort ist falsch' }, { status: 403 });
	}

	const newHash = await hashPassword(newPassword);
	db.update(users).set({ passwordHash: newHash }).where(eq(users.id, locals.user.id)).run();

	return json({ success: true });
};
