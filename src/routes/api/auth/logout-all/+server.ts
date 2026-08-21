import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { clearSession } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';

/**
 * Alle Sitzungen entwerten (Pentest F-08).
 *
 * Das normale Abmelden löscht nur das Cookie auf DIESEM Gerät — ein
 * gestohlenes Token bliebe bis zu 30 Tage gültig. Hier wird die
 * Sitzungsnummer erhöht; damit verlieren alle ausgestellten Tokens
 * sofort ihre Gültigkeit (die Prüfung sitzt in hooks.server.ts).
 */
export const POST: RequestHandler = async (event) => {
	const { locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	db.update(users)
		.set({ sessionVersion: sql`${users.sessionVersion} + 1` })
		.where(eq(users.id, locals.user.id))
		.run();

	logAudit({
		event,
		action: 'auth.logout_all',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username
	});

	clearSession(event.cookies);
	return json({ success: true });
};
