import { db } from '$lib/server/db';
import {
	trainingSessions,
	absences,
	users,
	trainingSpotVotes,
	spots,
	spotImages,
	sessionGuests,
	sessionHiddenUsers,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	soloTrainings
} from '$lib/server/db/schema';
import { eq, gte, asc, sql, and } from 'drizzle-orm';
import { getTrainingWindowForecast } from '$lib/server/trainingForecast';
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
import { ensureUpcomingTrainingSessions } from '$lib/server/ensureUpcomingTrainingSessions';

/** Viewer für den Training-Payload — Web (user) und API v1 nutzen dasselbe. */
export type TrainingViewer = {
	id: number;
	role?: string | null;
	trainingAttendance?: string | null;
} | null;

/**
 * Kompletter Payload der Training-Seite. Von der Web-Seite und von
 * GET /api/v1/training gemeinsam genutzt, damit App und Web nie auseinanderlaufen.
 */
export async function buildTrainingPagePayload(user: TrainingViewer) {
	const viewerAttendance = user?.trainingAttendance ?? null;
	const today = todayYmdInAppTZ();

	ensureUpcomingTrainingSessions();

	const sessions = db.select().from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(12)
		.all();

	const schemaOk = isTrainingAttendanceSchemaReady();
	const allUsers = schemaOk
		? db
				.select({
					id: users.id,
					username: users.username,
					active: users.active,
					avatar: users.avatar,
					trainingAttendance: users.trainingAttendance,
					autoAbsentWeekdays: users.autoAbsentWeekdays
				})
				.from(users)
				.where(usersNotDeletedCondition())
				.all()
				.map(normalizeUserForAttendance)
		: db
				.select({
					id: users.id,
					username: users.username,
					active: users.active,
					avatar: users.avatar
				})
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
	const allSpots = db.select({ id: spots.id, name: spots.name, city: spots.city }).from(spots).all();

	/**
	 * Erstes Bild je Spot — die App zeigt es als Kopfbild der Trainingskarte,
	 * damit die Oberfläche nicht nur aus Text besteht.
	 */
	const spotThumbs = new Map<number, string>();
	try {
		const rows = db
			.select({ spotId: spotImages.spotId, filename: spotImages.filename })
			.from(spotImages)
			.all();
		for (const r of rows) {
			if (!spotThumbs.has(r.spotId)) spotThumbs.set(r.spotId, `/uploads/${r.filename}`);
		}
	} catch {
		/* Tabelle optional */
	}

	const forecastBySessionKey = new Map<
		string,
		Awaited<ReturnType<typeof getTrainingWindowForecast>>
	>();

	for (const session of sessions) {
		const key = `${session.date}|${session.timeStart}|${session.timeEnd}`;
		if (forecastBySessionKey.has(key)) continue;
		try {
			forecastBySessionKey.set(
				key,
				await getTrainingWindowForecast({
					date: session.date,
					timeStart: session.timeStart,
					timeEnd: session.timeEnd
				})
			);
		} catch {
			// Prognose optional
		}
	}

	const trainingForecast =
		sessions.length > 0
			? forecastBySessionKey.get(
					`${sessions[0].date}|${sessions[0].timeStart}|${sessions[0].timeEnd}`
				) ?? null
			: null;

	const sessionsWithDetails = sessions.map((session) => {
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
			db.select({ userId: sessionHiddenUsers.userId })
				.from(sessionHiddenUsers)
				.where(eq(sessionHiddenUsers.sessionId, session.id))
				.all()
				.map((h) => h.userId)
		);

		const dbAbsentIds = new Set(sessionAbsences.map((a) => a.userId));
		let attending;
		let absencesForList;
		let userDbAbsent: boolean;
		let userVirtualAbsent: boolean;
		let userHasWeekdayOverride: boolean;
		let userHasRsvp: boolean;
		const uid = user?.id;

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
			userDbAbsent = uid ? dbAbsentIds.has(uid) : false;
			userVirtualAbsent = false;
			userHasWeekdayOverride = false;
			userHasRsvp = false;
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
			userDbAbsent = uid ? dbAbsentIds.has(uid) : false;
			userVirtualAbsent = uid ? effectiveAbsentIds.has(uid) && !dbAbsentIds.has(uid) : false;
			userHasWeekdayOverride = uid ? overrideUserIds.has(uid) : false;
			userHasRsvp = uid ? rsvpUserIds.has(uid) : false;
		}

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
			.where(andWithUsersNotDeleted(eq(trainingSpotVotes.sessionId, session.id)))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(sql`vote_count DESC`)
			.all();

		let userVotedSpotId: number | null = null;
		if (user) {
			const uv = db.select().from(trainingSpotVotes)
				.where(and(
					eq(trainingSpotVotes.userId, user.id),
					eq(trainingSpotVotes.sessionId, session.id)
				))
				.get();
			if (uv) userVotedSpotId = uv.spotId;
		}

		const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
		const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
		const votingClosed = new Date() > deadline;

		const fc = forecastBySessionKey.get(
			`${session.date}|${session.timeStart}|${session.timeEnd}`
		);

		let winnerSpot = null;
		let autoSpot = null;
		/** Vom Admin gesetzter Spot — schlägt Voting und Auto-Wahl. */
		let overrideSpot: { spotId: number; name: string; city: string } | null = null;
		if (session.overrideSpotId) {
			const os = db
				.select({ id: spots.id, name: spots.name, city: spots.city })
				.from(spots)
				.where(eq(spots.id, session.overrideSpotId))
				.get();
			if (os) overrideSpot = { spotId: os.id, name: os.name, city: os.city };
		}

		if (votingClosed) {
			if (spotVotes.length > 0) {
				winnerSpot = {
					name: spotVotes[0].spotName,
					city: spotVotes[0].spotCity,
					spotId: spotVotes[0].spotId,
					votes: asNum(spotVotes[0].voteCount)
				};
			} else if (fc) {
				let query = `SELECT s.id, s.name, s.city, COALESCE(AVG(v.score), 0) as avg_score
					FROM spots s LEFT JOIN votes v ON s.id = v.spot_id
					WHERE (s.city = 'Thun' OR s.city = 'Steffisburg' OR s.city = 'Hünibach' OR s.city = 'Heimberg')`;

				if (fc.applyLightingHardFilter) {
					query += ` AND s.lighting != 'nein'`;
				}
				if (fc.isWet) {
					query += ` AND s.good_weather LIKE '%nass%'`;
				} else {
					query += ` AND s.good_weather LIKE '%trocken%'`;
				}

				query += ` GROUP BY s.id ORDER BY avg_score DESC LIMIT 1`;

				const result = db.all(sql.raw(query)) as {
					id: number;
					name: string;
					city: string;
					avg_score: unknown;
				}[];
				if (result.length > 0) {
					autoSpot = { name: result[0].name, city: result[0].city, spotId: result[0].id };
				}
			}
		}

		const effectiveSpotId =
			session.overrideSpotId ?? winnerSpot?.spotId ?? autoSpot?.spotId ?? null;

		return {
			...session,
			// Wer den Zusatztermin eingetragen hat — für Anzeige und Löschrecht.
			createdByName:
				session.createdBy != null
					? (allUsers.find((u) => u.id === session.createdBy)?.username ?? null)
					: null,
			spotThumbnail: effectiveSpotId ? (spotThumbs.get(effectiveSpotId) ?? null) : null,
			overrideSpot,
			absences: absencesForList,
			attending,
			guests,
			userDbAbsent,
			userVirtualAbsent,
			userHasWeekdayOverride,
			userHasRsvp,
			totalMembers: allUsers.length,
			spotVotes: spotVotes.map((sv) => ({
				...sv,
				voteCount: asNum(sv.voteCount),
				voterList: (sv.voters || '').split(',')
			})),
			userVotedSpotId,
			votingClosed,
			winnerSpot,
			autoSpot
		};
	});

	// Solo-Trainings des Viewers — fürs Eintragen-Widget.
	let mySolo: { todayLogged: boolean; countMonth: number } = { todayLogged: false, countMonth: 0 };
	if (user) {
		const monthPrefix = today.slice(0, 7);
		const rows = db
			.select({ date: soloTrainings.date })
			.from(soloTrainings)
			.where(eq(soloTrainings.userId, user.id))
			.all();
		mySolo = {
			todayLogged: rows.some((r) => r.date === today),
			countMonth: rows.filter((r) => r.date.startsWith(monthPrefix)).length
		};
	}

	return {
		// Wer schaut zu — die Seite braucht das fürs Löschrecht bei
		// Zusatztrainings (Ersteller oder Admin).
		viewer: user ? { id: user.id, role: user.role ?? 'member' } : null,
		sessions: sessionsWithDetails,
		allSpots,
		trainingForecast,
		viewerTrainingAttendance: viewerAttendance,
		mySolo,
		calendarToday: today
	};
};
