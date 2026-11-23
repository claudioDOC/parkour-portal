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
	spotImages,
	soloTrainings
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
import { activePenaltyFor, maskAttending, wrongSpotFor } from '$lib/server/noShowPenalty';
import { nextTripSummary } from '$lib/server/tripDatePoll';
import { lateMarkedUserIds } from '$lib/server/lateAbsence';
import { ZUGKRAFT_ADMIN_ONLY, computeZugkraft } from '$lib/server/zugkraft';

/** Tag in YYYY-MM-TT verschieben, ohne Zeitzonen-Überraschungen. */
function addDaysYmdLocal(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ locals }) => {
	const today = todayYmdInAppTZ();

	ensureUpcomingTrainingSessions();
	const viewerPenalty = locals.user ? activePenaltyFor(locals.user.id) : null;
	const lateMarked = lateMarkedUserIds();

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

		// Strafrunde: Fragezeichen statt Namen; falscher Spot, sobald der echte fix ist.
		const penalized = Boolean(viewerPenalty && viewerPenalty.penalty.id === session.id);
		if (penalized && locals.user) attending = maskAttending(attending, locals.user.id);
		if (penalized && viewerPenalty?.stage === 2 && viewerPenalty.phase === 'wrongSpot' && effectiveVote) {
			const start = new Date(`${session.date}T${session.timeStart}:00`).getTime();
			const spotFixed = Boolean(session.overrideSpotId) || Date.now() > start - 2 * 60 * 60 * 1000;
			const wrong = spotFixed ? wrongSpotFor(effectiveVote.spotId) : null;
			if (wrong) {
				effectiveVote = {
					...effectiveVote,
					spotId: wrong.spotId,
					spotName: wrong.name,
					spotCity: wrong.city
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
			absences: absencesForList.map((a) => ({ ...a, lateMarked: lateMarked.has(a.userId) })),
			attending: attending.map((u) => ({ ...u, lateMarked: u.id > 0 && lateMarked.has(u.id) })),
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

	/**
	 * Wetter-Prognose je Training, aber nur für die kommenden sieben Tage:
	 * Weiter voraus liefert Open-Meteo kaum Verlässliches, und eine Zeile
	 * „Prognose: keine Daten" hilft niemandem — die wird weggelassen.
	 */
	const forecastHorizon = addDaysYmdLocal(today, 7);
	const forecastBySession = new Map<number, Awaited<ReturnType<typeof getTrainingWindowForecast>>>();
	for (const s of nextTrainings) {
		if (s.date > forecastHorizon) continue;
		try {
			const f = await getTrainingWindowForecast({
				date: s.date,
				timeStart: s.timeStart,
				timeEnd: s.timeEnd
			});
			if (f && f.condition !== 'unsicher') forecastBySession.set(s.id, f);
		} catch {
			// Prognose ist Beiwerk — ein Ausfall darf das Dashboard nicht kippen.
		}
	}
	const trainingForecast = nextTrainings[0] ? forecastBySession.get(nextTrainings[0].id) ?? null : null;

	// Solo-Trainings des Viewers — fürs Eintragen-Widget unter den Trainings.
	let mySolo: { todayLogged: boolean; countMonth: number } = { todayLogged: false, countMonth: 0 };
	if (locals.user) {
		const monthPrefix = today.slice(0, 7);
		const rows = db
			.select({ date: soloTrainings.date })
			.from(soloTrainings)
			.where(eq(soloTrainings.userId, locals.user.id))
			.all();
		mySolo = {
			todayLogged: rows.some((r) => r.date === today),
			countMonth: rows.filter((r) => r.date.startsWith(monthPrefix)).length
		};
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
		nextTrainings: trainingsWithDetails.map((s) => ({
			...s,
			forecast: forecastBySession.get(s.id) ?? null
		})),
		mySolo,
		// Zugkraft-Barometer: im Probelauf nur für Admins (ZUGKRAFT_ADMIN_ONLY).
		zugkraft:
			locals.user && (!ZUGKRAFT_ADMIN_ONLY || locals.user.role === 'admin')
				? computeZugkraft()
				: null,
		penalty: viewerPenalty,
		nextTrip: locals.user ? nextTripSummary(locals.user.id, today) : null,
		trainingForecast,
		topSpots,
		myStreak,
		calendarToday: today
	};
};
