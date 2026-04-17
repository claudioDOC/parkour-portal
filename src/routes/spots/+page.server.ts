import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { spots, votes, users, spotImages } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { asNum } from '$lib/server/asSqlNumber';
import { spotsTableHasMicrospotColumns } from '$lib/server/spotsTableColumns';

export const load: PageServerLoad = async () => {
	const hasMicro = spotsTableHasMicrospotColumns();
	const allSpots = hasMicro
		? db
				.select({
					id: spots.id,
					name: spots.name,
					city: spots.city,
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
		const firstImage = db.select({ filename: spotImages.filename })
			.from(spotImages)
			.where(eq(spotImages.spotId, spot.id))
			.limit(1)
			.get();
		return {
			...spot,
			avgScore: asNum(spot.avgScore),
			voteCount: asNum(spot.voteCount),
			parentSpotName: spot.parentSpotId ? spotNameById.get(spot.parentSpotId) ?? null : null,
			thumbnail: firstImage ? `/uploads/${firstImage.filename}` : null
		};
	});

	return { spots: spotsWithThumbnail };
};
