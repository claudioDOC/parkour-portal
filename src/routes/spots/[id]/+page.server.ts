import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { spots, votes, users, spotImages } from '$lib/server/db/schema';
import { eq, sql, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getNextOpenSessionId } from '$lib/server/training';

export const load: PageServerLoad = async ({ params, locals }) => {
	const spotId = parseInt(params.id);

	const spot = db.select({
		id: spots.id,
		name: spots.name,
		city: spots.city,
		latitude: spots.latitude,
		longitude: spots.longitude,
		lighting: spots.lighting,
		techniques: spots.techniques,
		goodWeather: spots.goodWeather,
		description: spots.description,
		addedBy: spots.addedBy,
		addedByName: users.username,
		deleted: spots.deleted,
		createdAt: spots.createdAt
	})
		.from(spots)
		.innerJoin(users, eq(spots.addedBy, users.id))
		.where(eq(spots.id, spotId))
		.get();

	if (!spot) {
		throw error(404, 'Spot nicht gefunden');
	}

	const stats = db.select({
		avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`,
		voteCount: sql<number>`COUNT(${votes.id})`
	})
		.from(votes)
		.where(eq(votes.spotId, spotId))
		.get();

	let userVote: number | null = null;
	if (locals.user) {
		const existing = db.select().from(votes)
			.where(and(eq(votes.userId, locals.user.id), eq(votes.spotId, spotId)))
			.get();
		if (existing) userVote = existing.score;
	}

	const images = db.select({
		id: spotImages.id,
		filename: spotImages.filename,
		uploadedBy: spotImages.uploadedBy
	})
		.from(spotImages)
		.where(eq(spotImages.spotId, spotId))
		.all();

	return {
		spot,
		avgScore: stats?.avgScore ?? 0,
		voteCount: stats?.voteCount ?? 0,
		userVote,
		images: images.map((img) => ({ ...img, url: `/uploads/${img.filename}` })),
		user: locals.user,
		nextOpenSessionId: getNextOpenSessionId()
	};
};
