import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	trainingSessions,
	absences,
	spots,
	votes,
	users,
	trainingSpotVotes,
	sessionGuests,
	sessionHiddenUsers,
	trainingSessionRsvp
} from '$lib/server/db/schema';
import { eq, gte, asc, desc, sql, and } from 'drizzle-orm';
import { filterAttendingUsers } from '$lib/server/trainingAttendance';

export const load: PageServerLoad = async ({ locals }) => {
	const today = new Date().toISOString().split('T')[0];

	const nextTrainings = db.select().from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(2)
		.all();

	const allUsers = db
		.select({
			id: users.id,
			username: users.username,
			active: users.active,
			trainingAttendance: users.trainingAttendance
		})
		.from(users)
		.all();

	const trainingsWithDetails = nextTrainings.map((session) => {
		const sessionAbsences = db.select({
			id: absences.id,
			userId: absences.userId,
			username: users.username,
			reason: absences.reason
		})
			.from(absences)
			.innerJoin(users, eq(absences.userId, users.id))
			.where(eq(absences.sessionId, session.id))
			.all();

		const hiddenUserIds = new Set(
			db
				.select({ userId: sessionHiddenUsers.userId })
				.from(sessionHiddenUsers)
				.where(eq(sessionHiddenUsers.sessionId, session.id))
				.all()
				.map((h) => h.userId)
		);

		const absentUserIds = new Set(sessionAbsences.map((a) => a.userId));
		const rsvpUserIds = new Set(
			db
				.select({ userId: trainingSessionRsvp.userId })
				.from(trainingSessionRsvp)
				.where(eq(trainingSessionRsvp.sessionId, session.id))
				.all()
				.map((r) => r.userId)
		);
		const attending = filterAttendingUsers(allUsers, absentUserIds, hiddenUserIds, rsvpUserIds);

		const guests = db
			.select({ id: sessionGuests.id, name: sessionGuests.name })
			.from(sessionGuests)
			.where(eq(sessionGuests.sessionId, session.id))
			.all();

		const userAbsent = locals.user ? absentUserIds.has(locals.user.id) : false;

		const topVote = db
			.select({
				spotId: trainingSpotVotes.spotId,
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

		return {
			...session,
			absences: sessionAbsences,
			attending,
			guests,
			userAbsent,
			topVote: topVote || null
		};
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
