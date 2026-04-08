import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	spots,
	votes,
	users,
	spotImages,
	spotChallenges,
	spotChallengeCompletions
} from '$lib/server/db/schema';
import { eq, sql, and, asc, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getNextOpenSessionId } from '$lib/server/training';
import { asNum } from '$lib/server/asSqlNumber';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';

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

	const challenges = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			description: spotChallenges.description,
			createdAt: spotChallenges.createdAt,
			createdBy: spotChallenges.createdBy,
			createdByName: users.username
		})
		.from(spotChallenges)
		.innerJoin(users, eq(spotChallenges.createdBy, users.id))
		.where(and(eq(spotChallenges.spotId, spotId), usersNotDeletedCondition()))
		.orderBy(asc(spotChallenges.createdAt))
		.all();

	const participants = db
		.select({
			id: users.id,
			username: users.username
		})
		.from(users)
		.where(and(eq(users.active, true), usersNotDeletedCondition()))
		.orderBy(asc(users.username))
		.all();

	const challengeIds = challenges.map((c) => c.id);
	const completions =
		challengeIds.length > 0
			? db
					.select({
						challengeId: spotChallengeCompletions.challengeId,
						userId: spotChallengeCompletions.userId,
						username: users.username
					})
					.from(spotChallengeCompletions)
					.innerJoin(users, eq(spotChallengeCompletions.userId, users.id))
					.where(and(inArray(spotChallengeCompletions.challengeId, challengeIds), usersNotDeletedCondition()))
					.orderBy(asc(users.username))
					.all()
			: [];

	return {
		spot,
		avgScore: asNum(stats?.avgScore ?? 0),
		voteCount: asNum(stats?.voteCount ?? 0),
		userVote,
		images: images.map((img) => ({ ...img, url: `/uploads/${img.filename}` })),
		challenges: challenges.map((challenge) => {
			const doneBy = completions
				.filter((c) => c.challengeId === challenge.id)
				.map((c) => ({ userId: c.userId, username: c.username }));
			const doneIds = new Set(doneBy.map((d) => d.userId));
			const openBy = participants.filter((p) => !doneIds.has(p.id));
			return {
				...challenge,
				doneCount: doneBy.length,
				openCount: openBy.length,
				doneBy,
				openBy
			};
		}),
		user: locals.user,
		nextOpenSessionId: getNextOpenSessionId()
	};
};
