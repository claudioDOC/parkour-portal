import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { spotChallenges, spots, users } from '$lib/server/db/schema';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (locals.user.role !== 'admin' && locals.user.role !== 'spotmanager') {
		throw error(403, 'Keine Berechtigung');
	}

	const trashed = url.searchParams.get('trashed') === 'true' || url.searchParams.get('trashed') === '1';
	if (!trashed) {
		return json({ challenges: [] });
	}

	if (!isSpotChallengesSchemaReady()) {
		return json({ challenges: [] });
	}

	const rows = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			description: spotChallenges.description,
			spotId: spotChallenges.spotId,
			spotName: spots.name,
			createdByName: users.username,
			deletedAt: spotChallenges.deletedAt
		})
		.from(spotChallenges)
		.innerJoin(spots, eq(spotChallenges.spotId, spots.id))
		.innerJoin(users, eq(spotChallenges.createdBy, users.id))
		.where(eq(spotChallenges.deleted, true))
		.orderBy(desc(spotChallenges.deletedAt))
		.all();

	return json({ challenges: rows });
};
