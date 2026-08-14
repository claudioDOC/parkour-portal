import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildProfilePayload } from '$lib/server/profilePayload';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { andWithUsersNotDeleted } from '$lib/server/usersWhere';

/** Profil wie die Web-Seite; ?userId=… zeigt das Profil eines anderen Users. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const requested = url.searchParams.get('userId');
	let targetId = locals.user.id;
	if (requested) {
		const id = Number(requested);
		if (!Number.isInteger(id)) throw error(400, 'Ungültige userId');
		const target = db.select({ id: users.id }).from(users)
			.where(andWithUsersNotDeleted(eq(users.id, id))).get();
		if (!target) throw error(404, 'User nicht gefunden');
		targetId = id;
	}
	return json(buildProfilePayload(targetId));
};
