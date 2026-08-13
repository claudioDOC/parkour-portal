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
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	spotImages
} from '$lib/server/db/schema';
import { eq, gte, asc, desc, sql, and } from 'drizzle-orm';
import {
	filterAttendingUsers,
	normalizeUserForAttendance,
	computeEffectiveAbsentUserIds,
	buildAbsenceListForSession
} from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { asNum } from '$lib/server/asSqlNumber';
import { andWithUsersNotDeleted, usersNotDeletedCondition } from '$lib/server/usersWhere';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { getTrainingWindowForecast } from '$lib/server/trainingForecast';
import { ensureUpcomingTrainingSessions } from '$lib/server/ensureUpcomingTrainingSessions';
import { computeTrainingStats } from '$lib/server/stats';

export const load: PageServerLoad = async ({ locals }) => {
	const today = todayYmdInAppTZ();

	ensureUpcomingTrainingSessions();

	const nextTrainings = db.select().from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(3)
		.all();

	const schemaOk = isTrainingAttendanceSchemaReady();
	const allUsers = schemaOk
		? db
				.select({
					id: users.id,
					username: users.username,
					active: users.active,
					trainingAttendance: users.trainingAttendance,
					autoAbsentWeekdays: users.autoAbsentWeekdays
				})
				.from(users)
				.where(usersNotDeletedCondition())
				.all()
				.map(normalizeUserForAttendance)
		: db
				.select({ id: users.id, username: users.username, active: users.active })
				.from(users)
				.where(usersNotDeletedCondition())
				.all()
				.map((u) => ({
					id: u.id,
					username: u.username,
					active: u.active ?? true,
					trainingAttendance: 'implicit' as const,
					autoAbsentWeekdays: [] as string[]
				}));

	const trainingsWithDetails = nextTrainings.map((session) => {
		const sessionAbsences = db.select({
			id: absences.id,
			userId: absences.userId,
			username: users.username,
			reason: absences.reason
		})
			.from(absences)
			.innerJoin(users, eq(absences.userId, users.id))
			.where(andWithUsersNotDeleted(eq(absences.sessionId, session.id)))
			.all();

		const hiddenUserIds = new Set(
			db
				.select({ userId: sessionHiddenUsers.userId })
				.from(sessionHiddenUsers)
				.where(eq(sessionHiddenUsers.sessionId, session.id))
				.all()
				.map((h) => h.userId)
		);

		const dbAbsentIds = new Set(sessionAbsences.map((a) => a.userId));
		let attending;
		let absencesForList;
		let userEffectivelyAbsent: boolean;
		const uid = locals.user?.id;

		if (!schemaOk) {
			const rsvpEmpty = new Set<number>();
			attending = filterAttendingUsers(allUsers, dbAbsentIds, hiddenUserIds, rsvpEmpty);
			absencesForList = sessionAbsences.map((a) => ({
				id: a.id,
				userId: a.userId,
				username: a.username,
				reason: a.reason,
				virtual: false as const
			}));
			userEffectivelyAbsent = uid ? dbAbsentIds.has(uid) : false;
		} else {
			const overrideUserIds = new Set(
				db
					.select({ userId: trainingSessionWeekdayOverride.userId })
					.from(trainingSessionWeekdayOverride)
					.where(eq(trainingSessionWeekdayOverride.sessionId, session.id))
					.all()
					.map((r) => r.userId)
			);
			const effectiveAbsentIds = computeEffectiveAbsentUserIds(
				allUsers,
				session.dayOfWeek,
				dbAbsentIds,
				overrideUserIds
			);
			const rsvpUserIds = new Set(
				db
					.select({ userId: trainingSessionRsvp.userId })
					.from(trainingSessionRsvp)
					.where(eq(trainingSessionRsvp.sessionId, session.id))
					.all()
					.map((r) => r.userId)
			);
			attending = filterAttendingUsers(allUsers, effectiveAbsentIds, hiddenUserIds, rsvpUserIds);
			absencesForList = buildAbsenceListForSession(
				allUsers,
				sessionAbsences,
				effectiveAbsentIds,
				dbAbsentIds,
				session.dayOfWeek
			);
			userEffectivelyAbsent = uid ? effectiveAbsentIds.has(uid) : false;
		}

		const guests = db
			.select({ id: sessionGuests.id, name: sessionGuests.name })
			.from(sessionGuests)
			.where(eq(sessionGuests.sessionId, session.id))
			.all();

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

		// Admin-Spot schlägt das Voting — auch im Dashboard.
		let effectiveVote = topVote;
		if (session.overrideSpotId) {
			const os = db
				.select({ id: spots.id, name: spots.name, city: spots.city })
				.from(spots)
				.where(eq(spots.id, session.overrideSpotId))
				.get();
			if (os) {
				effectiveVote = {
					spotId: os.id,
					spotName: os.name,
					spotCity: os.city,
					voteCount: 0
				} as typeof topVote;
			}
		}

		// Bild des führenden Spots — Hintergrund fürs Dashboard-Hero.
		let topVoteThumbnail: string | null = null;
		if (effectiveVote) {
			const img = db
				.select({ filename: spotImages.filename })
				.from(spotImages)
				.where(eq(spotImages.spotId, effectiveVote.spotId))
				.orderBy(asc(spotImages.id))
				.get();
			topVoteThumbnail = img ? `/uploads/${img.filename}` : null;
		}

		return {
			...session,
			absences: absencesForList,
			attending,
			guests,
			userEffectivelyAbsent,
			topVote: effectiveVote
				? {
						...effectiveVote,
						voteCount: asNum(effectiveVote.voteCount),
						thumbnail: topVoteThumbnail,
						fixedByAdmin: Boolean(session.overrideSpotId)
					}
				: null
		};
	});

	const topSpotsRaw = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
			voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
		})
		.from(spots)
		.leftJoin(votes, eq(spots.id, votes.spotId))
		.where(eq(spots.deleted, false))
		.groupBy(spots.id)
		.orderBy(desc(sql`avg_score`))
		.limit(5)
		.all();

	const topSpots = topSpotsRaw.map((s) => {
		const firstImage = db
			.select({ filename: spotImages.filename })
			.from(spotImages)
			.where(eq(spotImages.spotId, s.id))
			.orderBy(asc(spotImages.id))
			.get();
		return {
			...s,
			avgScore: asNum(s.avgScore),
			voteCount: asNum(s.voteCount),
			thumbnail: firstImage ? `/uploads/${firstImage.filename}` : null
		};
	});

	// Wetter-Prognose fürs nächste Training — optional, Fehler sind egal.
	let trainingForecast: Awaited<ReturnType<typeof getTrainingWindowForecast>> | null = null;
	const firstUpcoming = nextTrainings[0];
	if (firstUpcoming) {
		try {
			trainingForecast = await getTrainingWindowForecast({
				date: firstUpcoming.date,
				timeStart: firstUpcoming.timeStart,
				timeEnd: firstUpcoming.timeEnd
			});
		} catch {
			trainingForecast = null;
		}
	}

	// Persönliche Streak für die Begrüssung — 🔥 motiviert.
	let myStreak = 0;
	if (locals.user) {
		try {
			const row = computeTrainingStats().leaderboard.find((r) => r.userId === locals.user!.id);
			myStreak = row?.streakNoAbsence ?? 0;
		} catch {
			myStreak = 0;
		}
	}

	return {
		nextTrainings: trainingsWithDetails,
		trainingForecast,
		topSpots,
		myStreak,
		calendarToday: today
	};
};
