import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '$lib/server/auth';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	assertAdmin(locals);

	const allUsers = db.select({
		id: users.id,
		username: users.username,
		role: users.role,
		active: users.active,
		createdAt: users.createdAt,
		spotCount: sql<number>`(SELECT COUNT(*) FROM spots WHERE added_by = ${users.id})`,
		voteCount: sql<number>`(SELECT COUNT(*) FROM votes WHERE user_id = ${users.id})`
	}).from(users).all();

	return json({ users: allUsers });
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	assertAdmin(locals);

	const { userId, action, newPassword, newRole } = await request.json();

	if (!userId) {
		return json({ error: 'User-ID erforderlich' }, { status: 400 });
	}

	const user = db.select().from(users).where(eq(users.id, userId)).get();
	if (!user) {
		return json({ error: 'User nicht gefunden' }, { status: 404 });
	}

	if (action === 'reset_password') {
		if (!newPassword || newPassword.length < 4) {
			return json({ error: 'Neues Passwort muss mindestens 4 Zeichen haben' }, { status: 400 });
		}
		const hash = await hashPassword(newPassword);
		db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId)).run();
		return json({ success: true, message: `Passwort für ${user.username} zurückgesetzt` });
	}

	if (action === 'change_role') {
		if (userId === locals.user.id) {
			return json({ error: 'Du kannst deine eigene Rolle nicht ändern' }, { status: 400 });
		}
		if (newRole !== 'admin' && newRole !== 'spotmanager' && newRole !== 'member') {
			return json({ error: 'Ungültige Rolle' }, { status: 400 });
		}
		db.update(users).set({ role: newRole }).where(eq(users.id, userId)).run();
		return json({ success: true, message: `${user.username} ist jetzt ${newRole}` });
	}

	if (action === 'toggle_active') {
		if (userId === locals.user.id) {
			return json({ error: 'Du kannst dich nicht selbst deaktivieren' }, { status: 400 });
		}
		const newActive = !user.active;
		db.update(users).set({ active: newActive }).where(eq(users.id, userId)).run();
		const status = newActive ? 'aktiviert' : 'deaktiviert';
		return json({ success: true, message: `${user.username} wurde ${status}` });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};
