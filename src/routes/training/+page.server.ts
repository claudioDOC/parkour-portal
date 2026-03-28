import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	trainingSessions,
	absences,
	users,
	trainingSpotVotes,
	spots,
	sessionGuests,
	sessionHiddenUsers,
	trainingSessionRsvp
} from '$lib/server/db/schema';
import { eq, gte, asc, sql, and } from 'drizzle-orm';
import { getCurrentWeather } from '$lib/server/weather';
import { filterAttendingUsers } from '$lib/server/trainingAttendance';

export const load: PageServerLoad = async ({ locals }) => {
	const viewerAttendance = locals.user?.trainingAttendance ?? null;
	const today = new Date().toISOString().split('T')[0];

	const sessions = db.select().from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(8)
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
	const allSpots = db.select({ id: spots.id, name: spots.name, city: spots.city }).from(spots).all();

	let weather = null;
	try {
		weather = await getCurrentWeather();
	} catch {}

	const sessionsWithDetails = sessions.map((session) => {
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
			db.select({ userId: sessionHiddenUsers.userId })
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
		const userAbsent = locals.user ? absentUserIds.has(locals.user.id) : false;
		const userHasRsvp = locals.user ? rsvpUserIds.has(locals.user.id) : false;

		const guests = db.select({ id: sessionGuests.id, name: sessionGuests.name })
			.from(sessionGuests)
			.where(eq(sessionGuests.sessionId, session.id))
			.all();

		const spotVotes = db.select({
			spotId: trainingSpotVotes.spotId,
			spotName: spots.name,
			spotCity: spots.city,
			voteCount: sql<number>`COUNT(${trainingSpotVotes.id})`.as('vote_count'),
			voters: sql<string>`GROUP_CONCAT(${users.username})`.as('voters')
		})
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
			.innerJoin(users, eq(trainingSpotVotes.userId, users.id))
			.where(eq(trainingSpotVotes.sessionId, session.id))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(sql`vote_count DESC`)
			.all();

		let userVotedSpotId: number | null = null;
		if (locals.user) {
			const uv = db.select().from(trainingSpotVotes)
				.where(and(
					eq(trainingSpotVotes.userId, locals.user.id),
					eq(trainingSpotVotes.sessionId, session.id)
				))
				.get();
			if (uv) userVotedSpotId = uv.spotId;
		}

		const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
		const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
		const votingClosed = new Date() > deadline;

		let winnerSpot = null;
		let autoSpot = null;

		if (votingClosed) {
			if (spotVotes.length > 0) {
				winnerSpot = {
					name: spotVotes[0].spotName,
					city: spotVotes[0].spotCity,
					spotId: spotVotes[0].spotId,
					votes: spotVotes[0].voteCount
				};
			} else if (weather) {
				let query = `SELECT s.id, s.name, s.city, COALESCE(AVG(v.score), 0) as avg_score
					FROM spots s LEFT JOIN votes v ON s.id = v.spot_id
					WHERE (s.city = 'Thun' OR s.city = 'Steffisburg')`;

				if (weather.isDark) {
					query += ` AND s.lighting != 'nein'`;
				}
				if (weather.isWet) {
					query += ` AND s.good_weather LIKE '%nass%'`;
				} else {
					query += ` AND s.good_weather LIKE '%trocken%'`;
				}

				query += ` GROUP BY s.id ORDER BY avg_score DESC LIMIT 1`;

				const result = db.all(sql.raw(query)) as { id: number; name: string; city: string; avg_score: number }[];
				if (result.length > 0) {
					autoSpot = { name: result[0].name, city: result[0].city, spotId: result[0].id };
				}
			}
		}

		return {
			...session,
			absences: sessionAbsences,
			attending,
			guests,
			userAbsent,
			userHasRsvp,
			totalMembers: allUsers.length,
			spotVotes: spotVotes.map((sv) => ({
				...sv,
				voterList: (sv.voters || '').split(',')
			})),
			userVotedSpotId,
			votingClosed,
			winnerSpot,
			autoSpot
		};
	});

	return {
		sessions: sessionsWithDetails,
		allSpots,
		weather,
		viewerTrainingAttendance: viewerAttendance
	};
};
