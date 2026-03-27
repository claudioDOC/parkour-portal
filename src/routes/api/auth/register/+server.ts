import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, invites } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword, createSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { username, password, token } = await request.json();

	if (!username || !password || !token) {
		return json({ error: 'Alle Felder sind erforderlich' }, { status: 400 });
	}

	if (username.length < 3) {
		return json({ error: 'Username muss mindestens 3 Zeichen lang sein' }, { status: 400 });
	}

	if (password.length < 6) {
		return json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' }, { status: 400 });
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

	const existingUser = db.select().from(users).where(eq(users.username, username)).get();
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

	return json({ success: true, user: { id: result.id, username: result.username, role: result.role } });
};
