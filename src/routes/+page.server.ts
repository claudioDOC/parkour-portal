import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { trainingSessions, absences, spots, votes, users, trainingSpotVotes } from '$lib/server/db/schema';
import { eq, gte, asc, desc, sql, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const today = new Date().toISOString().split('T')[0];

	const nextTrainings = db.select().from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(2)
		.all();

	const trainingsWithDetails = nextTrainings.map((session) => {
		const sessionAbsences = db.select({
			id: absences.id,
			username: users.username,
			reason: absences.reason
		})
			.from(absences)
			.innerJoin(users, eq(absences.userId, users.id))
			.where(eq(absences.sessionId, session.id))
			.all();

		const userAbsent = locals.user
			? sessionAbsences.some((a) => a.username === locals.user!.username)
			: false;

		const topVote = db.select({
			spotName: spots.name,
			spotCity: spots.city,
			voteCount: sql<number>`COUNT(${trainingSpotVotes.id})`.as('vote_count')
		})
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
			.where(eq(trainingSpotVotes.sessionId, session.id))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(desc(sql`vote_count`))
			.limit(1)
			.get();

		return { ...session, absences: sessionAbsences, userAbsent, topVote: topVote || null };
	});

	const topSpots = db.select({
		id: spots.id,
		name: spots.name,
		city: spots.city,
		avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
		voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
	})
		.from(spots)
		.leftJoin(votes, eq(spots.id, votes.spotId))
		.groupBy(spots.id)
		.orderBy(desc(sql`avg_score`))
		.limit(5)
		.all();

	const memberCount = db.select({ count: sql<number>`COUNT(*)` }).from(users).get();

	return {
		nextTrainings: trainingsWithDetails,
		topSpots,
		memberCount: memberCount?.count ?? 0
	};
};
