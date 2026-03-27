import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, createSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { username, password } = await request.json();

	if (!username || !password) {
		return json({ error: 'Username und Passwort erforderlich' }, { status: 400 });
	}

	const user = db.select().from(users).where(eq(users.username, username)).get();
	if (!user) {
		return json({ error: 'Ungültige Anmeldedaten' }, { status: 401 });
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		return json({ error: 'Ungültige Anmeldedaten' }, { status: 401 });
	}

	if (!user.active) {
		return json({ error: 'Dein Account wurde deaktiviert. Kontaktiere einen Admin.' }, { status: 403 });
	}

	createSession(user, cookies);

	return json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
};
