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
import { auditLogs } from '$lib/server/db/schema';
import { isImplicitEffectiveAbsent } from '$lib/server/trainingAttendance';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { asNum } from '$lib/server/asSqlNumber';
import { andWithUsersNotDeleted } from '$lib/server/usersWhere';
import { spotsTableHasDeletedColumn } from '$lib/server/spotsTableColumns';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { votingDeadlineFor } from '$lib/server/training';

/** Statistik startet bewusst erst ab April 2026 (März-Testdaten ausblenden). */
const STATS_START_DATE = '2026-04-01';

export type UserTrainingStats = {
	userId: number;
	username: string;
	avatar: string | null;
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
	/** Verlauf aller ausdrücklichen Abmeldungen samt Grund, neueste zuerst. */
	absenceHistory: AbsenceHistoryRow[];
};

export type AbsenceHistoryRow = {
	id: number;
	sessionId: number;
	date: string;
	dayOfWeek: string;
	isExtra: boolean;
	cancelled: boolean;
	userId: number;
	username: string;
	avatar: string | null;
	reason: string;
	/** Minuten NACH dem Spot-Schluss, wenn die Abmeldung zu spät kam (sonst null). */
	lateMinutes: number | null;
	/** Vom Admin nachgetragen („war nicht da") statt selbst abgemeldet. */
	byAdmin: boolean;
};

/**
 * Abmelde-Verlauf: Was waren die Gründe? Nur ausdrückliche Einträge
 * (Wochentags-Regeln haben keinen Text) an vergangenen Trainings — die
 * Trainingsseite zeigt nur kommende Termine, darum ist das hier die
 * einzige Stelle, an der man das nachlesen kann.
 */
function buildAbsenceHistory(limit = 300): AbsenceHistoryRow[] {
	const rows = db
		.select({
			id: absences.id,
			sessionId: absences.sessionId,
			createdAt: absences.createdAt,
			reason: absences.reason,
			userId: users.id,
			username: users.username,
			avatar: users.avatar,
			date: trainingSessions.date,
			dayOfWeek: trainingSessions.dayOfWeek,
			timeStart: trainingSessions.timeStart,
			timeEnd: trainingSessions.timeEnd,
			isExtra: trainingSessions.isExtra,
			cancelled: trainingSessions.cancelled
		})
		.from(absences)
		.innerJoin(users, eq(absences.userId, users.id))
		.innerJoin(trainingSessions, eq(absences.sessionId, trainingSessions.id))
		.where(andWithUsersNotDeleted(lt(trainingSessions.date, todayYmdInAppTZ())))
		.orderBy(desc(trainingSessions.date), asc(users.username))
		.limit(limit)
		.all();

	// Wer hat den Eintrag gemacht? Die Tabelle `absences` hält das nicht fest,
	// das Audit-Log aber schon. Nötig, weil ein Admin-Nachtrag („war nicht da",
	// oft Tage später) sonst als „zu spät abgemeldet" gelesen würde — der
	// Grundtext taugt nicht als Unterscheidung (es gab Nachträge wie „Hamburg").
	const adminEntered = new Set<string>();
	for (const a of db
		.select({ targetUserId: auditLogs.targetUserId, detailJson: auditLogs.detailJson })
		.from(auditLogs)
		.where(eq(auditLogs.action, 'admin.training.add_absence'))
		.all()) {
		if (a.targetUserId == null || !a.detailJson) continue;
		try {
			const sid = (JSON.parse(a.detailJson) as { sessionId?: unknown }).sessionId;
			if (typeof sid === 'number') adminEntered.add(`${a.targetUserId}:${sid}`);
		} catch {
			// Kaputtes JSON im Log darf die Statistik nicht kippen.
		}
	}

	return rows.map((r) => {
		// Zu spät = nach dem Spot-Schluss eingetragen (siehe votingDeadlineFor:
		// zwei Stunden vor Beginn, spätestens 16:15) und vor Trainingsende.
		const byAdmin = adminEntered.has(`${asNum(r.userId)}:${asNum(r.sessionId)}`);
		let lateMinutes: number | null = null;
		if (r.createdAt && !r.isExtra && !byAdmin) {
			const created = new Date(String(r.createdAt).replace(' ', 'T') + 'Z').getTime();
			const deadline = votingDeadlineFor({
				date: r.date,
				timeStart: r.timeStart,
				isExtra: r.isExtra
			}).getTime();
			const end = new Date(`${r.date}T${r.timeEnd}:00`).getTime();
			if (Number.isFinite(created) && created > deadline && created <= end) {
				lateMinutes = Math.max(1, Math.round((created - deadline) / 60000));
			}
		}
		return {
			id: asNum(r.id),
			sessionId: asNum(r.sessionId),
			date: r.date,
			dayOfWeek: r.dayOfWeek,
			isExtra: Boolean(r.isExtra),
			cancelled: Boolean(r.cancelled),
			userId: asNum(r.userId),
			username: r.username,
			avatar: r.avatar ? `/uploads/${r.avatar}` : null,
			reason: r.reason ?? 'Kann nicht',
			lateMinutes,
			byAdmin
		};
	});
}

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
		.all()
		// Abgesagte Trainings zählen nicht in die Statistik.
		// Abgesagte zählen nicht — und Zusatztrainings ebenso wenig: Sie
		// sind spontan, niemand meldet sich dafür ab, und im Standardmodus
		// würden sie allen eine Anwesenheit gutschreiben.
		.filter((s) => !s.cancelled && !s.isExtra);

	// Explizite Spalten: kein `select()` auf ganze Tabelle — sonst schlägt SQLite fehl,
	// wenn `users.deleted` (Migration 0004) in der DB noch fehlt.
	const members = db
		.select({
			id: users.id,
			username: users.username,
			avatar: users.avatar,
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
			const absent = isImplicitEffectiveAbsent(u, s, absencePairs, overridePairs);
			if (absent) totalAbsences++;
			// Effektiv dabei: Im Zusage-Modus zählt nur die ausdrückliche Zusage —
			// sonst stünde jemand, der nie kommt und sich nie abmeldet, in jedem
			// Training als anwesend und hebt den Schnitt um eine ganze Person.
			const present =
				u.trainingAttendance === 'opt_in'
					? !absent && rsvpPairs.has(`${u.id}:${s.id}`)
					: !absent;
			if (present) totalPulled++;
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
		// Zusage-Accounts, die nie zu- oder abgesagt haben, gehören nicht in die
		// Rangliste: 0 % für jemanden, der schlicht nicht mitmacht, ist keine
		// Aussage — und verzerrt die Hall of Fame. Sobald eine Zusage oder
		// Abmeldung kommt, erscheint die Person von selbst.
		if (u.trainingAttendance === 'opt_in' && implicitPresent === 0 && abs === 0) continue;
		const showUpPercent =
			eligible.length > 0 ? Math.round((implicitPresent / eligible.length) * 1000) / 10 : 0;

		// Streak = tatsächlich dabei in Folge. Bei opt_in zählt nur die
		// ausdrückliche Zusage — „nicht abgemeldet" heisst dort „nicht da".
		let streak = 0;
		for (let i = eligible.length - 1; i >= 0; i--) {
			const sess = eligible[i];
			const attended =
				u.trainingAttendance === 'opt_in'
					? rsvpPairs.has(`${u.id}:${sess.id}`) && !absencePairs.has(`${u.id}:${sess.id}`)
					: !isImplicitEffectiveAbsent(u, sess, absencePairs, overridePairs);
			if (!attended) break;
			streak++;
		}

		const uid = asNum(u.id);
		leaderboard.push({
			userId: uid,
			username: u.username,
			avatar: u.avatar ? `/uploads/${u.avatar}` : null,
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
			// Gleiche Regel wie in der Gesamt-Rangliste: ohne jede Aktivität nicht listen.
			if (u.trainingAttendance === 'opt_in' && implicitPresent === 0 && abs === 0) continue;
			const showUpPercent =
				eligible.length > 0 ? Math.round((implicitPresent / eligible.length) * 1000) / 10 : 0;
			let streak = 0;
			for (let i = eligible.length - 1; i >= 0; i--) {
				const sess = eligible[i];
				const attended =
					u.trainingAttendance === 'opt_in'
						? rsvpPairs.has(`${u.id}:${sess.id}`) && !absencePairs.has(`${u.id}:${sess.id}`)
						: !isImplicitEffectiveAbsent(u, sess, absencePairs, overridePairs);
				if (!attended) break;
				streak++;
			}
			const uidM = asNum(u.id);
			lb.push({
				userId: uidM,
				username: u.username,
				avatar: u.avatar ? `/uploads/${u.avatar}` : null,
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
		// Vom Admin gesetzter Spot (auch nachträglich: „wir waren spontan woanders")
		// schlägt das Voting — sonst zählt die Statistik einen Spot, an dem
		// niemand war.
		if (s.overrideSpotId) {
			const os = db
				.select({ id: spots.id, name: spots.name, city: spots.city })
				.from(spots)
				.where(eq(spots.id, s.overrideSpotId))
				.get();
			if (os) {
				spotUsageEvents.push({
					sessionId: s.id,
					date: s.date,
					spotId: os.id,
					spotName: os.name,
					spotCity: os.city,
					voteCount: 0
				});
				continue;
			}
		}
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
		spotUsageEvents,
		absenceHistory: buildAbsenceHistory()
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
		.all()
		// Abgesagte Trainings zählen nicht in die Statistik.
		// Abgesagte zählen nicht — und Zusatztrainings ebenso wenig: Sie
		// sind spontan, niemand meldet sich dafür ab, und im Standardmodus
		// würden sie allen eine Anwesenheit gutschreiben.
		.filter((s) => !s.cancelled && !s.isExtra);

	const members = db
		.select({
			id: users.id,
			username: users.username,
			avatar: users.avatar,
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
			avatar: u.avatar ? `/uploads/${u.avatar}` : null,
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
				avatar: u.avatar ? `/uploads/${u.avatar}` : null,
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
		// Vom Admin gesetzter Spot (auch nachträglich: „wir waren spontan woanders")
		// schlägt das Voting — sonst zählt die Statistik einen Spot, an dem
		// niemand war.
		if (s.overrideSpotId) {
			const os = db
				.select({ id: spots.id, name: spots.name, city: spots.city })
				.from(spots)
				.where(eq(spots.id, s.overrideSpotId))
				.get();
			if (os) {
				spotUsageEvents.push({
					sessionId: s.id,
					date: s.date,
					spotId: os.id,
					spotName: os.name,
					spotCity: os.city,
					voteCount: 0
				});
				continue;
			}
		}
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
		spotUsageEvents,
		absenceHistory: buildAbsenceHistory()
	};
}

function formatMonthLabel(ym: string): string {
	const [y, m] = ym.split('-').map(Number);
	const d = new Date(y, m - 1, 1);
	return d.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}
