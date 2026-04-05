import { users } from '$lib/server/db/schema';

/** Nur Spalten, die in allen unterstützten DB-Versionen existieren (ohne training_*). */
export const userCoreAuth = {
	id: users.id,
	username: users.username,
	passwordHash: users.passwordHash,
	role: users.role,
	active: users.active,
	deleted: users.deleted,
	sessionVersion: users.sessionVersion
} as const;
