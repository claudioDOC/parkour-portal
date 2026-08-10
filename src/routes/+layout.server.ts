import type { LayoutServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

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
		user: locals.user ? { ...locals.user, avatar } : null
	};
};
