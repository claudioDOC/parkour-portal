import type { LayoutServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { zugAlarmFor } from '$lib/server/zugkraft';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Avatar separat nachladen — steckt nicht im Session-JWT.
	let avatar: string | null = null;
	if (locals.user) {
		try {
			const row = db
				.select({ avatar: users.avatar })
				.from(users)
				.where(eq(users.id, locals.user.id))
				.get();
			avatar = row?.avatar ? `/uploads/${row.avatar}` : null;
		} catch {
			// Spalte fehlt (Migration ausstehend) — Initialen-Avatar reicht.
		}
	}
	return {
		user: locals.user ? { ...locals.user, avatar } : null,
		// Roter Rahmen um den ganzen Bildschirm bei „Katastrophe" (jede Seite).
		// Läuft bei jeder Live-Änderung (invalidateAll) neu mit.
		zugAlarm: zugAlarmFor(locals.user)
	};
};
