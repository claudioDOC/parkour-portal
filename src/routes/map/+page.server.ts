import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { spots, votes } from '$lib/server/db/schema';
import { asNum } from '$lib/server/asSqlNumber';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const rows = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			latitude: spots.latitude,
			longitude: spots.longitude,
			avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
			voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
		})
		.from(spots)
		.leftJoin(votes, eq(spots.id, votes.spotId))
		.where(
			and(eq(spots.deleted, false), isNotNull(spots.latitude), isNotNull(spots.longitude))
		)
		.groupBy(spots.id)
		.orderBy(asc(spots.city), asc(spots.name))
		.all();

	const mapSpots = rows
		.filter(
			(s) =>
				s.latitude != null &&
				s.longitude != null &&
				Number.isFinite(s.latitude) &&
				Number.isFinite(s.longitude)
		)
		.map((s) => ({
			id: s.id,
			name: s.name,
			city: s.city,
			latitude: s.latitude,
			longitude: s.longitude,
			avgScore: asNum(s.avgScore),
			voteCount: asNum(s.voteCount)
		}));

	return { spots: mapSpots };
};
