import { db } from '$lib/server/db';
import {
	spots,
	votes,
	users,
	spotImages,
	spotChallenges,
	trainingSessions,
	trainingSpotVotes
} from '$lib/server/db/schema';
import { and, asc, eq, desc, gte, sql } from 'drizzle-orm';
import { asNum } from '$lib/server/asSqlNumber';
import { spotsTableHasMicrospotColumns } from '$lib/server/spotsTableColumns';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

export function buildSpotsListPayload() {
	const hasMicro = spotsTableHasMicrospotColumns();
	const allSpots = hasMicro
		? db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					latitude: spots.latitude,
					longitude: spots.longitude,
					lighting: spots.lighting,
					techniques: spots.techniques,
					goodWeather: spots.goodWeather,
					description: spots.description,
					isMicro: spots.isMicro,
					parentSpotId: spots.parentSpotId,
					addedByName: users.username,
					avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
					voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
				})
				.from(spots)
				.leftJoin(votes, eq(spots.id, votes.spotId))
				.innerJoin(users, eq(spots.addedBy, users.id))
				.where(eq(spots.deleted, false))
				.groupBy(spots.id)
				.orderBy(desc(sql`avg_score`))
				.all()
		: db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
					latitude: spots.latitude,
					longitude: spots.longitude,
					lighting: spots.lighting,
					techniques: spots.techniques,
					goodWeather: spots.goodWeather,
					description: spots.description,
					addedByName: users.username,
					avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
					voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
				})
				.from(spots)
				.leftJoin(votes, eq(spots.id, votes.spotId))
				.innerJoin(users, eq(spots.addedBy, users.id))
				.where(eq(spots.deleted, false))
				.groupBy(spots.id)
				.orderBy(desc(sql`avg_score`))
				.all()
				.map((s) => ({ ...s, isMicro: false, parentSpotId: null }));

	const spotNameById = new Map(allSpots.map((s) => [s.id, s.name]));

	const spotsWithThumbnail = allSpots.map((spot) => {
		const firstImage = db
			.select({ filename: spotImages.filename })
			.from(spotImages)
			.where(eq(spotImages.spotId, spot.id))
			.limit(1)
			.get();
		let challengeCount = 0;
		try {
			challengeCount = Number(
				db
					.select({ c: sql<number>`COUNT(*)` })
					.from(spotChallenges)
					.where(and(eq(spotChallenges.spotId, spot.id), eq(spotChallenges.deleted, false)))
					.get()?.c ?? 0
			);
		} catch {
			/* Challenge-Schema evtl. nicht bereit */
		}
		return {
			...spot,
			avgScore: asNum(spot.avgScore),
			voteCount: asNum(spot.voteCount),
			parentSpotName: spot.parentSpotId ? (spotNameById.get(spot.parentSpotId) ?? null) : null,
			thumbnail: firstImage ? `/uploads/${firstImage.filename}` : null,
			challengeCount
		};
	});

	return { spots: spotsWithThumbnail, nextTrainingSpotId: findNextTrainingSpotId() };
}

/** Spot mit den meisten Votes fürs nächste Training — wie auf der Web-Karte. */
function findNextTrainingSpotId(): number | null {
	const nextSession = db
		.select()
		.from(trainingSessions)
		.where(and(gte(trainingSessions.date, todayYmdInAppTZ()), eq(trainingSessions.cancelled, false)))
		.orderBy(asc(trainingSessions.date))
		.limit(1)
		.get();
	if (!nextSession) return null;
	const top = db
		.select({ spotId: trainingSpotVotes.spotId, c: sql<number>`COUNT(*)`.as('c') })
		.from(trainingSpotVotes)
		.where(eq(trainingSpotVotes.sessionId, nextSession.id))
		.groupBy(trainingSpotVotes.spotId)
		.orderBy(desc(sql`c`))
		.limit(1)
		.get();
	return top?.spotId ?? null;
}
