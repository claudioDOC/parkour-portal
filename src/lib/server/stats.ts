import { db } from '$lib/server/db';
import { users, trainingSessions, absences, spots, votes, trainingSessionRsvp } from '$lib/server/db/schema';
import { eq, lt, asc, sql } from 'drizzle-orm';

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
		avgAbsencesPerSession: number;
		memberCount: number;
	};
	monthly: MonthGroupRow[];
	monthDetail: MonthLeaderboard[];
	leaderboard: UserTrainingStats[];
};

function userStartDate(createdAt: string): string {
	return createdAt.slice(0, 10);
}

export function computeTrainingStats(): TrainingStatsPayload {
	const today = new Date().toISOString().split('T')[0];

	const pastSessions = db
		.select()
		.from(trainingSessions)
		.where(lt(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.all();

	const members = db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.username)).all();

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

	const spotsByUser = db
		.select({ uid: spots.addedBy, c: sql<number>`count(*)` })
		.from(spots)
		.where(eq(spots.deleted, false))
		.groupBy(spots.addedBy)
		.all();
	const spotCountMap = new Map<number, number>();
	for (const row of spotsByUser) spotCountMap.set(row.uid, Number(row.c));

	const votesByUser = db
		.select({ uid: votes.userId, c: sql<number>`count(*)` })
		.from(votes)
		.groupBy(votes.userId)
		.all();
	const voteCountMap = new Map<number, number>();
	for (const row of votesByUser) voteCountMap.set(row.uid, Number(row.c));

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
	const avgAbsencesPerSession =
		pastSessionCount > 0 ? Math.round((totalAbsences / pastSessionCount) * 10) / 10 : 0;

	const leaderboard: UserTrainingStats[] = [];

	for (const u of members) {
		const start = userStartDate(u.createdAt);
		const eligible = pastSessions.filter((s) => s.date >= start);
		const eligibleIds = eligible.map((s) => s.id);
		let abs = 0;
		for (const sid of eligibleIds) {
			if (absencePairs.has(`${u.id}:${sid}`)) abs++;
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
			if (absencePairs.has(`${u.id}:${eligible[i].id}`)) break;
			streak++;
		}

		leaderboard.push({
			userId: u.id,
			username: u.username,
			eligiblePastSessions: eligible.length,
			absences: abs,
			implicitPresent,
			showUpPercent,
			streakNoAbsence: streak,
			spotsSuggested: spotCountMap.get(u.id) ?? 0,
			spotStarVotes: voteCountMap.get(u.id) ?? 0
		});
	}

	leaderboard.sort((a, b) => b.showUpPercent - a.showUpPercent || b.streakNoAbsence - a.streakNoAbsence);

	const monthKeys = [...new Set(pastSessions.map((s) => s.date.slice(0, 7)))].sort();
	const monthDetail: MonthLeaderboard[] = [];

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
				if (absencePairs.has(`${u.id}:${eligible[i].id}`)) break;
				streak++;
			}
			lb.push({
				userId: u.id,
				username: u.username,
				eligiblePastSessions: eligible.length,
				absences: abs,
				implicitPresent,
				showUpPercent,
				streakNoAbsence: streak,
				spotsSuggested: spotCountMap.get(u.id) ?? 0,
				spotStarVotes: voteCountMap.get(u.id) ?? 0
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

	return {
		today,
		group: {
			pastSessionCount,
			totalAbsences,
			avgAbsencesPerSession,
			memberCount: members.length
		},
		monthly,
		monthDetail,
		leaderboard
	};
}

function formatMonthLabel(ym: string): string {
	const [y, m] = ym.split('-').map(Number);
	const d = new Date(y, m - 1, 1);
	return d.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}
