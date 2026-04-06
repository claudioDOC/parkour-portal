import { db } from '$lib/server/db';
import {
	absences,
	sessionGuests,
	sessionHiddenUsers,
	spots,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	trainingSessions,
	trainingSpotVotes,
	users
} from '$lib/server/db/schema';
import { asNum } from '$lib/server/asSqlNumber';
import {
	buildAbsenceListForSession,
	computeEffectiveAbsentUserIds,
	filterAttendingUsers,
	normalizeUserForAttendance
} from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { andWithUsersNotDeleted, usersNotDeletedCondition } from '$lib/server/usersWhere';
import { and, asc, eq, gte, sql } from 'drizzle-orm';

type PublicStatusMode = 'today' | 'next';

type PublicSessionStatus = {
	id: number;
	date: string;
	dayOfWeek: string;
	timeStart: string;
	timeEnd: string;
	votingClosed: boolean;
	attending: string[];
	guestNames: string[];
	attendingCount: number;
	guestCount: number;
	totalPresent: number;
	absences: { username: string; reason: string | null; virtual: boolean }[];
	spotVotes: {
		spotId: number;
		spotName: string;
		spotCity: string;
		voteCount: number;
		voters: string[];
	}[];
	topSpot: { spotId: number; spotName: string; spotCity: string; voteCount: number } | null;
	winnerSpot: { spotId: number; spotName: string; spotCity: string; votes: number } | null;
	summaryText: string;
};

export type PublicTrainingStatus = {
	generatedAt: string;
	mode: PublicStatusMode;
	session: PublicSessionStatus | null;
};

function formatSummary(s: Omit<PublicSessionStatus, 'summaryText'>): string {
	const votes = s.topSpot ? `${s.topSpot.spotName} (${s.topSpot.voteCount} Stimmen)` : 'kein Spot-Vote';
	return `${s.dayOfWeek} ${s.date} ${s.timeStart}-${s.timeEnd}: ${s.totalPresent} dabei (${s.attendingCount} Mitglieder + ${s.guestCount} Gäste), Top-Spot: ${votes}.`;
}

export function getPublicTrainingStatus(mode: PublicStatusMode): PublicTrainingStatus {
	const today = new Date().toISOString().split('T')[0];
	const sessions = db
		.select()
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(12)
		.all();

	const picked =
		mode === 'today' ? sessions.find((s) => s.date === today) ?? null : sessions.length > 0 ? sessions[0] : null;
	if (!picked) {
		return {
			generatedAt: new Date().toISOString(),
			mode,
			session: null
		};
	}

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

	const sessionAbsences = db
		.select({
			id: absences.id,
			userId: absences.userId,
			username: users.username,
			reason: absences.reason
		})
		.from(absences)
		.innerJoin(users, eq(absences.userId, users.id))
		.where(andWithUsersNotDeleted(eq(absences.sessionId, picked.id)))
		.all();

	const hiddenUserIds = new Set(
		db
			.select({ userId: sessionHiddenUsers.userId })
			.from(sessionHiddenUsers)
			.where(eq(sessionHiddenUsers.sessionId, picked.id))
			.all()
			.map((h) => h.userId)
	);

	const dbAbsentIds = new Set(sessionAbsences.map((a) => a.userId));
	let attending: { id: number; username: string }[] = [];
	let absencesForList: { username: string; reason: string | null; virtual: boolean }[] = [];

	if (!schemaOk) {
		attending = filterAttendingUsers(allUsers, dbAbsentIds, hiddenUserIds, new Set<number>());
		absencesForList = sessionAbsences.map((a) => ({
			username: a.username,
			reason: a.reason,
			virtual: false
		}));
	} else {
		const overrideUserIds = new Set(
			db
				.select({ userId: trainingSessionWeekdayOverride.userId })
				.from(trainingSessionWeekdayOverride)
				.where(eq(trainingSessionWeekdayOverride.sessionId, picked.id))
				.all()
				.map((r) => r.userId)
		);
		const effectiveAbsentIds = computeEffectiveAbsentUserIds(
			allUsers,
			picked.dayOfWeek,
			dbAbsentIds,
			overrideUserIds
		);
		const rsvpUserIds = new Set(
			db
				.select({ userId: trainingSessionRsvp.userId })
				.from(trainingSessionRsvp)
				.where(eq(trainingSessionRsvp.sessionId, picked.id))
				.all()
				.map((r) => r.userId)
		);
		attending = filterAttendingUsers(allUsers, effectiveAbsentIds, hiddenUserIds, rsvpUserIds);
		absencesForList = buildAbsenceListForSession(
			allUsers,
			sessionAbsences,
			effectiveAbsentIds,
			dbAbsentIds,
			picked.dayOfWeek
		).map((a) => ({ username: a.username, reason: a.reason, virtual: a.virtual }));
	}

	const guests = db
		.select({ name: sessionGuests.name })
		.from(sessionGuests)
		.where(eq(sessionGuests.sessionId, picked.id))
		.all();

	const spotVotes = db
		.select({
			spotId: trainingSpotVotes.spotId,
			spotName: spots.name,
			spotCity: spots.city,
			voteCount: sql<number>`COUNT(${trainingSpotVotes.id})`.as('vote_count'),
			voters: sql<string>`GROUP_CONCAT(${users.username})`.as('voters')
		})
		.from(trainingSpotVotes)
		.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
		.innerJoin(users, eq(trainingSpotVotes.userId, users.id))
		.where(andWithUsersNotDeleted(eq(trainingSpotVotes.sessionId, picked.id)))
		.groupBy(trainingSpotVotes.spotId)
		.orderBy(sql`vote_count DESC`)
		.all()
		.map((sv) => ({
			spotId: sv.spotId,
			spotName: sv.spotName,
			spotCity: sv.spotCity,
			voteCount: asNum(sv.voteCount),
			voters: (sv.voters || '').split(',').filter(Boolean)
		}));

	const trainingStart = new Date(`${picked.date}T${picked.timeStart}:00`);
	const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
	const votingClosed = new Date() > deadline;

	const topSpot = spotVotes[0]
		? {
				spotId: spotVotes[0].spotId,
				spotName: spotVotes[0].spotName,
				spotCity: spotVotes[0].spotCity,
				voteCount: spotVotes[0].voteCount
			}
		: null;

	const winnerSpot = votingClosed && topSpot
		? {
				spotId: topSpot.spotId,
				spotName: topSpot.spotName,
				spotCity: topSpot.spotCity,
				votes: topSpot.voteCount
			}
		: null;

	const session: Omit<PublicSessionStatus, 'summaryText'> = {
		id: picked.id,
		date: picked.date,
		dayOfWeek: picked.dayOfWeek,
		timeStart: picked.timeStart,
		timeEnd: picked.timeEnd,
		votingClosed,
		attending: attending.map((u) => u.username),
		guestNames: guests.map((g) => g.name),
		attendingCount: attending.length,
		guestCount: guests.length,
		totalPresent: attending.length + guests.length,
		absences: absencesForList,
		spotVotes,
		topSpot,
		winnerSpot
	};

	return {
		generatedAt: new Date().toISOString(),
		mode,
		session: {
			...session,
			summaryText: formatSummary(session)
		}
	};
}
