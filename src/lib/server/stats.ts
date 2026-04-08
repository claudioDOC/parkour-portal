import { db } from '$lib/server/db';
import {
	users,
	trainingSessions,
	absences,
	spots,
	votes,
	trainingSpotVotes,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	spotChallengeCompletions,
	spotChallenges
} from '$lib/server/db/schema';
import { isImplicitEffectiveAbsent } from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { asNum } from '$lib/server/asSqlNumber';
import { andWithUsersNotDeleted } from '$lib/server/usersWhere';
import { spotsTableHasDeletedColumn } from '$lib/server/spotsTableColumns';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';

/** Statistik startet bewusst erst ab April 2026 (März-Testdaten ausblenden). */
const STATS_START_DATE = '2026-04-01';

export type UserTrainingStats = {
	userId: number;
	username: string;
	eligiblePastSessions: number;
	absences: number;
	implicitPresent: number;
	showUpPercent: number;
	streakNoAbsence: number;
	spotsSuggested: number;
	spotStarVotes: number;
	challengesCompleted: number;
	totalChallenges: number;
	challengeProgressPercent: number;
};

export type MonthGroupRow = {
	key: string;
	label: string;
	sessionCount: number;
	absenceCount: number;
};

export type MonthLeaderboard = {
	key: string;
	label: string;
	sessionCount: number;
	absenceCount: number;
	leaderboard: UserTrainingStats[];
};

export type TrainingStatsPayload = {
	today: string;
	group: {
		pastSessionCount: number;
		totalAbsences: number;
		avgPulledPerSession: number;
		memberCount: number;
	};
	monthly: MonthGroupRow[];
	monthDetail: MonthLeaderboard[];
	leaderboard: UserTrainingStats[];
	spotUsageEvents: {
		sessionId: number;
		date: string;
		spotId: number;
		spotName: string;
		spotCity: string;
		voteCount: number;
	}[];
};

function userStartDate(createdAt: string | null | undefined): string {
	if (!createdAt || typeof createdAt !== 'string') return '1970-01-01';
	return createdAt.length >= 10 ? createdAt.slice(0, 10) : createdAt;
}

function buildSpotCountByAddedBy(): Map<number, number> {
	const sel = db.select({ uid: spots.addedBy, c: sql<number>`count(*)` }).from(spots);
	const rows = spotsTableHasDeletedColumn()
		? sel.where(eq(spots.deleted, false)).groupBy(spots.addedBy).all()
		: sel.groupBy(spots.addedBy).all();
	const m = new Map<number, number>();
	for (const row of rows) m.set(asNum(row.uid), asNum(row.c));
	return m;
}

export function computeTrainingStats(): TrainingStatsPayload {
	if (!isTrainingAttendanceSchemaReady()) {
		return computeTrainingStatsLegacy();
	}

	const today = new Date().toISOString().split('T')[0];

	const pastSessions = db
		.select()
		.from(trainingSessions)
		.where(and(gte(trainingSessions.date, STATS_START_DATE), lt(trainingSessions.date, today)))
		.orderBy(asc(trainingSessions.date))
		.all();

	// Explizite Spalten: kein `select()` auf ganze Tabelle — sonst schlägt SQLite fehl,
	// wenn `users.deleted` (Migration 0004) in der DB noch fehlt.
	const members = db
		.select({
			id: users.id,
			username: users.username,
			createdAt: users.createdAt,
			active: users.active,
			trainingAttendance: users.trainingAttendance,
			autoAbsentWeekdays: users.autoAbsentWeekdays
		})
		.from(users)
		.where(andWithUsersNotDeleted(eq(users.active, true)))
		.orderBy(asc(users.username))
		.all();

	const allAbsences = db.select().from(absences).all();
	const absencePairs = new Set<string>();
	for (const a of allAbsences) {
		absencePairs.add(`${a.userId}:${a.sessionId}`);
	}

	const allRsvp = db.select().from(trainingSessionRsvp).all();
	const rsvpPairs = new Set<string>();
	for (const r of allRsvp) {
		rsvpPairs.add(`${r.userId}:${r.sessionId}`);
	}

	const allOverrides = db.select().from(trainingSessionWeekdayOverride).all();
	const overridePairs = new Set<string>();
	for (const o of allOverrides) {
		overridePairs.add(`${o.userId}:${o.sessionId}`);
	}

	const spotCountMap = buildSpotCountByAddedBy();

	const votesByUser = db
		.select({ uid: votes.userId, c: sql<number>`count(*)` })
		.from(votes)
		.groupBy(votes.userId)
		.all();
	const voteCountMap = new Map<number, number>();
	for (const row of votesByUser) voteCountMap.set(asNum(row.uid), asNum(row.c));

	const monthlyMap = new Map<string, { sessions: number; absences: number }>();

	for (const s of pastSessions) {
		const mk = s.date.slice(0, 7);
		if (!monthlyMap.has(mk)) monthlyMap.set(mk, { sessions: 0, absences: 0 });
		monthlyMap.get(mk)!.sessions += 1;
	}

	for (const s of pastSessions) {
		const mk = s.date.slice(0, 7);
		if (!monthlyMap.has(mk)) monthlyMap.set(mk, { sessions: 0, absences: 0 });
		for (const u of members) {
			if (isImplicitEffectiveAbsent(u, s, absencePairs, overridePairs)) {
				monthlyMap.get(mk)!.absences += 1;
			}
		}
	}

	const monthly: MonthGroupRow[] = [...monthlyMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, v]) => ({
			key,
			label: formatMonthLabel(key),
			sessionCount: v.sessions,
			absenceCount: v.absences
		}));

	const pastSessionCount = pastSessions.length;
	let totalAbsences = 0;
	let totalPulled = 0;
	for (const s of pastSessions) {
		for (const u of members) {
			if (isImplicitEffectiveAbsent(u, s, absencePairs, overridePairs)) totalAbsences++;
			else totalPulled++;
		}
	}
	const avgPulledPerSession =
		pastSessionCount > 0 ? Math.round((totalPulled / pastSessionCount) * 10) / 10 : 0;
	const challengesReady = isSpotChallengesSchemaReady();
	const totalChallenges = challengesReady
		? asNum(
				db
					.select({ c: sql<number>`count(*)` })
					.from(spotChallenges)
					.where(eq(spotChallenges.deleted, false))
					.get()?.c ?? 0
			)
		: 0;
	const challengeCompletionsByUser = new Map<number, number>();
	if (challengesReady) {
		const rows = db
			.select({ uid: spotChallengeCompletions.userId, c: sql<number>`count(*)` })
			.from(spotChallengeCompletions)
			.innerJoin(spotChallenges, eq(spotChallengeCompletions.challengeId, spotChallenges.id))
			.where(eq(spotChallenges.deleted, false))
			.groupBy(spotChallengeCompletions.userId)
			.all();
		for (const row of rows) challengeCompletionsByUser.set(asNum(row.uid), asNum(row.c));
	}

	const leaderboard: UserTrainingStats[] = [];

	for (const u of members) {
		const start = userStartDate(u.createdAt);
		const eligible = pastSessions.filter((s) => s.date >= start);
		const eligibleIds = eligible.map((s) => s.id);
		let abs = 0;
		for (const s of eligible) {
			if (isImplicitEffectiveAbsent(u, s, absencePairs, overridePairs)) abs++;
		}
		const implicitPresent =
			u.trainingAttendance === 'opt_in'
				? eligibleIds.filter(
						(sid) => !absencePairs.has(`${u.id}:${sid}`) && rsvpPairs.has(`${u.id}:${sid}`)
					).length
				: eligible.length - abs;
		const showUpPercent =
			eligible.length > 0 ? Math.round((implicitPresent / eligible.length) * 1000) / 10 : 0;

		let streak = 0;
		for (let i = eligible.length - 1; i >= 0; i--) {
			if (isImplicitEffectiveAbsent(u, eligible[i], absencePairs, overridePairs)) break;
			streak++;
		}

		const uid = asNum(u.id);
		leaderboard.push({
			userId: uid,
			username: u.username,
			eligiblePastSessions: eligible.length,
			absences: abs,
			implicitPresent,
			showUpPercent,
			streakNoAbsence: streak,
			spotsSuggested: spotCountMap.get(uid) ?? 0,
			spotStarVotes: voteCountMap.get(uid) ?? 0,
			challengesCompleted: challengeCompletionsByUser.get(uid) ?? 0,
			totalChallenges,
			challengeProgressPercent:
				totalChallenges > 0
					? Math.round(((challengeCompletionsByUser.get(uid) ?? 0) / totalChallenges) * 100)
					: 0
		});
	}

	leaderboard.sort((a, b) => b.showUpPercent - a.showUpPercent || b.streakNoAbsence - a.streakNoAbsence);

	const monthKeys = [...new Set(pastSessions.map((s) => s.date.slice(0, 7)))].sort();
	const monthDetail: MonthLeaderboard[] = [];
	const spotUsageEvents: TrainingStatsPayload['spotUsageEvents'] = [];

	for (const key of monthKeys) {
		const sessionsInMonth = pastSessions.filter((s) => s.date.startsWith(key));
		const sc = sessionsInMonth.length;
		let monthAbs = 0;
		const lb: UserTrainingStats[] = [];

		for (const u of members) {
			const start = userStartDate(u.createdAt);
			const eligible = sessionsInMonth.filter((s) => s.date >= start);
			let abs = 0;
			for (const s of eligible) {
				if (isImplicitEffectiveAbsent(u, s, absencePairs, overridePairs)) abs++;
			}
			monthAbs += abs;
			const implicitPresent =
				u.trainingAttendance === 'opt_in'
					? eligible.filter(
							(s) =>
								!absencePairs.has(`${u.id}:${s.id}`) && rsvpPairs.has(`${u.id}:${s.id}`)
						).length
					: eligible.length - abs;
			const showUpPercent =
				eligible.length > 0 ? Math.round((implicitPresent / eligible.length) * 1000) / 10 : 0;
			let streak = 0;
			for (let i = eligible.length - 1; i >= 0; i--) {
				if (isImplicitEffectiveAbsent(u, eligible[i], absencePairs, overridePairs)) break;
				streak++;
			}
			const uidM = asNum(u.id);
			lb.push({
				userId: uidM,
				username: u.username,
				eligiblePastSessions: eligible.length,
				absences: abs,
				implicitPresent,
				showUpPercent,
				streakNoAbsence: streak,
				spotsSuggested: spotCountMap.get(uidM) ?? 0,
				spotStarVotes: voteCountMap.get(uidM) ?? 0,
				challengesCompleted: challengeCompletionsByUser.get(uidM) ?? 0,
				totalChallenges,
				challengeProgressPercent:
					totalChallenges > 0
						? Math.round(((challengeCompletionsByUser.get(uidM) ?? 0) / totalChallenges) * 100)
						: 0
			});
		}

		lb.sort((a, b) => b.showUpPercent - a.showUpPercent || b.implicitPresent - a.implicitPresent);
		monthDetail.push({
			key,
			label: formatMonthLabel(key),
			sessionCount: sc,
			absenceCount: monthAbs,
			leaderboard: lb
		});
	}

	for (const s of pastSessions) {
		const topSpot = db
			.select({
				spotId: trainingSpotVotes.spotId,
				spotName: spots.name,
				spotCity: spots.city,
				voteCount: sql<number>`COUNT(${trainingSpotVotes.id})`.as('vote_count')
			})
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
			.where(eq(trainingSpotVotes.sessionId, s.id))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(sql`vote_count DESC`, asc(trainingSpotVotes.spotId))
			.limit(1)
			.get();
		if (!topSpot) continue;
		spotUsageEvents.push({
			sessionId: s.id,
			date: s.date,
			spotId: topSpot.spotId,
			spotName: topSpot.spotName,
			spotCity: topSpot.spotCity,
			voteCount: asNum(topSpot.voteCount)
		});
	}

	return {
		today,
		group: {
			pastSessionCount,
			totalAbsences,
			avgPulledPerSession,
			memberCount: members.length
		},
		monthly,
		monthDetail,
		leaderboard,
		spotUsageEvents
	};
}

/** Vor Migration 0002/0003: nur DB-Abmeldungen, alle als implicit. */
function computeTrainingStatsLegacy(): TrainingStatsPayload {
	const today = new Date().toISOString().split('T')[0];

	const pastSessions = db
		.select()
		.from(trainingSessions)
		.where(and(gte(trainingSessions.date, STATS_START_DATE), lt(trainingSessions.date, today)))
		.orderBy(asc(trainingSessions.date))
		.all();

	const members = db
		.select({
			id: users.id,
			username: users.username,
			createdAt: users.createdAt,
			active: users.active
		})
		.from(users)
		.where(andWithUsersNotDeleted(eq(users.active, true)))
		.orderBy(asc(users.username))
		.all();

	const allAbsences = db.select().from(absences).all();
	const absencePairs = new Set<string>();
	for (const a of allAbsences) {
		absencePairs.add(`${a.userId}:${a.sessionId}`);
	}

	const spotCountMap = buildSpotCountByAddedBy();

	const votesByUser = db
		.select({ uid: votes.userId, c: sql<number>`count(*)` })
		.from(votes)
		.groupBy(votes.userId)
		.all();
	const voteCountMap = new Map<number, number>();
	for (const row of votesByUser) voteCountMap.set(asNum(row.uid), asNum(row.c));

	const monthlyMap = new Map<string, { sessions: number; absences: number }>();

	for (const s of pastSessions) {
		const mk = s.date.slice(0, 7);
		if (!monthlyMap.has(mk)) monthlyMap.set(mk, { sessions: 0, absences: 0 });
		monthlyMap.get(mk)!.sessions += 1;
	}

	for (const a of allAbsences) {
		const session = pastSessions.find((x) => x.id === a.sessionId);
		if (!session) continue;
		const mk = session.date.slice(0, 7);
		if (!monthlyMap.has(mk)) monthlyMap.set(mk, { sessions: 0, absences: 0 });
		monthlyMap.get(mk)!.absences += 1;
	}

	const monthly: MonthGroupRow[] = [...monthlyMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, v]) => ({
			key,
			label: formatMonthLabel(key),
			sessionCount: v.sessions,
			absenceCount: v.absences
		}));

	const pastSessionCount = pastSessions.length;
	const totalAbsences = allAbsences.filter((a) => pastSessions.some((s) => s.id === a.sessionId)).length;
	const totalPossible = pastSessionCount * members.length;
	const totalPulled = Math.max(0, totalPossible - totalAbsences);
	const avgPulledPerSession =
		pastSessionCount > 0 ? Math.round((totalPulled / pastSessionCount) * 10) / 10 : 0;
	const challengesReady = isSpotChallengesSchemaReady();
	const totalChallenges = challengesReady
		? asNum(
				db
					.select({ c: sql<number>`count(*)` })
					.from(spotChallenges)
					.where(eq(spotChallenges.deleted, false))
					.get()?.c ?? 0
			)
		: 0;
	const challengeCompletionsByUser = new Map<number, number>();
	if (challengesReady) {
		const rows = db
			.select({ uid: spotChallengeCompletions.userId, c: sql<number>`count(*)` })
			.from(spotChallengeCompletions)
			.innerJoin(spotChallenges, eq(spotChallengeCompletions.challengeId, spotChallenges.id))
			.where(eq(spotChallenges.deleted, false))
			.groupBy(spotChallengeCompletions.userId)
			.all();
		for (const row of rows) challengeCompletionsByUser.set(asNum(row.uid), asNum(row.c));
	}

	const leaderboard: UserTrainingStats[] = [];

	for (const u of members) {
		const start = userStartDate(u.createdAt);
		const eligible = pastSessions.filter((s) => s.date >= start);
		const eligibleIds = eligible.map((s) => s.id);
		let abs = 0;
		for (const sid of eligibleIds) {
			if (absencePairs.has(`${u.id}:${sid}`)) abs++;
		}
		const implicitPresent = eligible.length - abs;
		const showUpPercent =
			eligible.length > 0 ? Math.round((implicitPresent / eligible.length) * 1000) / 10 : 0;

		let streak = 0;
		for (let i = eligible.length - 1; i >= 0; i--) {
			if (absencePairs.has(`${u.id}:${eligible[i].id}`)) break;
			streak++;
		}

		const uidL = asNum(u.id);
		leaderboard.push({
			userId: uidL,
			username: u.username,
			eligiblePastSessions: eligible.length,
			absences: abs,
			implicitPresent,
			showUpPercent,
			streakNoAbsence: streak,
			spotsSuggested: spotCountMap.get(uidL) ?? 0,
			spotStarVotes: voteCountMap.get(uidL) ?? 0,
			challengesCompleted: challengeCompletionsByUser.get(uidL) ?? 0,
			totalChallenges,
			challengeProgressPercent:
				totalChallenges > 0
					? Math.round(((challengeCompletionsByUser.get(uidL) ?? 0) / totalChallenges) * 100)
					: 0
		});
	}

	leaderboard.sort((a, b) => b.showUpPercent - a.showUpPercent || b.streakNoAbsence - a.streakNoAbsence);

	const monthKeys = [...new Set(pastSessions.map((s) => s.date.slice(0, 7)))].sort();
	const monthDetail: MonthLeaderboard[] = [];
	const spotUsageEvents: TrainingStatsPayload['spotUsageEvents'] = [];

	for (const key of monthKeys) {
		const sessionsInMonth = pastSessions.filter((s) => s.date.startsWith(key));
		const sc = sessionsInMonth.length;
		let monthAbs = 0;
		const lb: UserTrainingStats[] = [];

		for (const u of members) {
			const start = userStartDate(u.createdAt);
			const eligible = sessionsInMonth.filter((s) => s.date >= start);
			let abs = 0;
			for (const s of eligible) {
				if (absencePairs.has(`${u.id}:${s.id}`)) abs++;
			}
			monthAbs += abs;
			const implicitPresent = eligible.length - abs;
			const showUpPercent =
				eligible.length > 0 ? Math.round((implicitPresent / eligible.length) * 1000) / 10 : 0;
			let streak = 0;
			for (let i = eligible.length - 1; i >= 0; i--) {
				if (absencePairs.has(`${u.id}:${eligible[i].id}`)) break;
				streak++;
			}
			const uidLb = asNum(u.id);
			lb.push({
				userId: uidLb,
				username: u.username,
				eligiblePastSessions: eligible.length,
				absences: abs,
				implicitPresent,
				showUpPercent,
				streakNoAbsence: streak,
				spotsSuggested: spotCountMap.get(uidLb) ?? 0,
				spotStarVotes: voteCountMap.get(uidLb) ?? 0,
				challengesCompleted: challengeCompletionsByUser.get(uidLb) ?? 0,
				totalChallenges,
				challengeProgressPercent:
					totalChallenges > 0
						? Math.round(((challengeCompletionsByUser.get(uidLb) ?? 0) / totalChallenges) * 100)
						: 0
			});
		}

		lb.sort((a, b) => b.showUpPercent - a.showUpPercent || b.implicitPresent - a.implicitPresent);
		monthDetail.push({
			key,
			label: formatMonthLabel(key),
			sessionCount: sc,
			absenceCount: monthAbs,
			leaderboard: lb
		});
	}

	for (const s of pastSessions) {
		const topSpot = db
			.select({
				spotId: trainingSpotVotes.spotId,
				spotName: spots.name,
				spotCity: spots.city,
				voteCount: sql<number>`COUNT(${trainingSpotVotes.id})`.as('vote_count')
			})
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
			.where(eq(trainingSpotVotes.sessionId, s.id))
			.groupBy(trainingSpotVotes.spotId)
			.orderBy(sql`vote_count DESC`, asc(trainingSpotVotes.spotId))
			.limit(1)
			.get();
		if (!topSpot) continue;
		spotUsageEvents.push({
			sessionId: s.id,
			date: s.date,
			spotId: topSpot.spotId,
			spotName: topSpot.spotName,
			spotCity: topSpot.spotCity,
			voteCount: asNum(topSpot.voteCount)
		});
	}

	return {
		today,
		group: {
			pastSessionCount,
			totalAbsences,
			avgPulledPerSession,
			memberCount: members.length
		},
		monthly,
		monthDetail,
		leaderboard,
		spotUsageEvents
	};
}

function formatMonthLabel(ym: string): string {
	const [y, m] = ym.split('-').map(Number);
	const d = new Date(y, m - 1, 1);
	return d.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}
