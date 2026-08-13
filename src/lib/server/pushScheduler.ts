/**
 * Verschickt Trainings-Erinnerungen ohne externen Cron: ein Intervall im
 * laufenden Serverprozess prüft alle 10 Minuten, ob etwas fällig ist.
 *
 * Doppelversand nach einem Neustart verhindert `push_reminder_log` — pro
 * (Session, Art) darf genau eine Erinnerung rausgehen.
 */
import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from './db';
import {
	absences,
	pushReminderLog,
	sessionHiddenUsers,
	spots,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	trainingSessions,
	trainingSpotVotes,
	users
} from './db/schema';
import { todayYmdInAppTZ } from './calendarToday';
import { isPushConfigured, sendToUsersWithPref } from './push';
import { usersNotDeletedCondition } from './usersWhere';
import {
	normalizeUserForAttendance,
	computeEffectiveAbsentUserIds,
	filterAttendingUsers
} from './trainingAttendance';

const APP_CALENDAR_TZ = 'Europe/Zurich';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Erinnerung an das Training von morgen — abends. */
const EVENING_REMINDER_HOUR = 18;
/** Erinnerung an eine fehlende Zu-/Absage — am Trainingstag morgens. */
const RSVP_REMINDER_HOUR = 9;

let started = false;

/** Stunde in Zürich, unabhängig von der Serverzeitzone. */
function currentHourInAppTZ(now = new Date()): number {
	const h = new Intl.DateTimeFormat('en-GB', {
		timeZone: APP_CALENDAR_TZ,
		hour: '2-digit',
		hour12: false
	}).format(now);
	return Number(h);
}

/** Minuten seit Mitternacht in Zürich. */
function currentMinutesInAppTZ(now = new Date()): number {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: APP_CALENDAR_TZ,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(now);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
	return get('hour') * 60 + get('minute');
}

/** "18:15" → Minuten seit Mitternacht; ungültig → null. */
function parseTimeToMinutes(t: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
	if (!m) return null;
	return Number(m[1]) * 60 + Number(m[2]);
}

function addDaysYmd(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** true, wenn für (Session, Art) noch nichts verschickt wurde — und markiert es. */
function claimReminder(sessionId: number, kind: string): boolean {
	const existing = db
		.select({ id: pushReminderLog.id })
		.from(pushReminderLog)
		.where(and(eq(pushReminderLog.sessionId, sessionId), eq(pushReminderLog.kind, kind)))
		.get();
	if (existing) return false;
	try {
		db.insert(pushReminderLog).values({ sessionId, kind }).run();
		return true;
	} catch {
		// Unique-Index hat zugeschlagen (paralleler Lauf) — dann nicht nochmal senden.
		return false;
	}
}

function formatTime(session: { timeStart: string; timeEnd: string }): string {
	return `${session.timeStart}–${session.timeEnd}`;
}

/** Wer laut Trainingsseite mitzieht — gleiche Helfer, damit die Logik nicht auseinanderläuft. */
export function attendingUserIds(sessionId: number, dayOfWeek: string): number[] {
	const allUsers = db
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
		.map(normalizeUserForAttendance);

	const idsOf = (rows: { userId: number }[]) => new Set(rows.map((r) => r.userId));

	const dbAbsentIds = idsOf(
		db
			.select({ userId: absences.userId })
			.from(absences)
			.where(eq(absences.sessionId, sessionId))
			.all()
	);
	const overrideIds = idsOf(
		db
			.select({ userId: trainingSessionWeekdayOverride.userId })
			.from(trainingSessionWeekdayOverride)
			.where(eq(trainingSessionWeekdayOverride.sessionId, sessionId))
			.all()
	);
	const hiddenIds = idsOf(
		db
			.select({ userId: sessionHiddenUsers.userId })
			.from(sessionHiddenUsers)
			.where(eq(sessionHiddenUsers.sessionId, sessionId))
			.all()
	);
	const rsvpIds = idsOf(
		db
			.select({ userId: trainingSessionRsvp.userId })
			.from(trainingSessionRsvp)
			.where(eq(trainingSessionRsvp.sessionId, sessionId))
			.all()
	);

	const effectiveAbsent = computeEffectiveAbsentUserIds(
		allUsers,
		dayOfWeek,
		dbAbsentIds,
		overrideIds
	);

	return filterAttendingUsers(allUsers, effectiveAbsent, hiddenIds, rsvpIds).map((u) => u.id);
}

async function runEveningReminder(now: Date): Promise<void> {
	if (currentHourInAppTZ(now) !== EVENING_REMINDER_HOUR) return;
	const tomorrow = addDaysYmd(todayYmdInAppTZ(now), 1);

	const sessions = db
		.select()
		.from(trainingSessions)
		.where(eq(trainingSessions.date, tomorrow))
		.all();

	for (const session of sessions) {
		if (session.cancelled) continue;
		if (!claimReminder(session.id, 'evening')) continue;
		const candidates = attendingUserIds(session.id, session.dayOfWeek);
		if (candidates.length === 0) continue;
		await sendToUsersWithPref(
			'trainingReminder',
			{
				title: `Training morgen — ${session.dayOfWeek}`,
				body: `${formatTime(session)}. Wenn du nicht kannst, jetzt abmelden.`,
				url: '/training',
				tag: `training-${session.id}`
			},
			candidates
		);
	}
}

async function runRsvpReminder(now: Date): Promise<void> {
	if (currentHourInAppTZ(now) !== RSVP_REMINDER_HOUR) return;
	const today = todayYmdInAppTZ(now);

	const sessions = db
		.select()
		.from(trainingSessions)
		.where(eq(trainingSessions.date, today))
		.all();

	for (const session of sessions) {
		if (session.cancelled) continue;
		if (!claimReminder(session.id, 'rsvp')) continue;

		// Nur opt_in-User, die sich weder zu- noch abgemeldet haben.
		const optInUsers = db
			.select({ id: users.id, trainingAttendance: users.trainingAttendance })
			.from(users)
			.where(usersNotDeletedCondition())
			.all()
			.filter((u) => u.trainingAttendance === 'opt_in')
			.map((u) => u.id);
		if (optInUsers.length === 0) continue;

		const decided = new Set<number>();
		for (const row of db
			.select({ userId: trainingSessionRsvp.userId })
			.from(trainingSessionRsvp)
			.where(
				and(
					eq(trainingSessionRsvp.sessionId, session.id),
					inArray(trainingSessionRsvp.userId, optInUsers)
				)
			)
			.all()) {
			decided.add(row.userId);
		}
		for (const row of db
			.select({ userId: absences.userId })
			.from(absences)
			.where(eq(absences.sessionId, session.id))
			.all()) {
			decided.add(row.userId);
		}

		const undecided = optInUsers.filter((id) => !decided.has(id));
		if (undecided.length === 0) continue;

		await sendToUsersWithPref(
			'trainingRsvpReminder',
			{
				title: `Heute Training — ${formatTime(session)}`,
				body: 'Du hast dich noch nicht eingetragen. Bist du dabei?',
				url: '/training',
				tag: `training-rsvp-${session.id}`
			},
			undecided
		);
	}
}

/**
 * „Spot fix“: Sobald das Voting schliesst (2 h vor Trainingsbeginn, bei 18:15
 * also 16:15), bekommen alle Mitziehenden den Gewinner-Spot gemeldet.
 * Ohne Votes gibt es nichts zu melden — dann wird still übersprungen.
 */
async function runSpotFixNotification(now: Date): Promise<void> {
	const today = todayYmdInAppTZ(now);
	const nowMin = currentMinutesInAppTZ(now);

	const sessions = db
		.select()
		.from(trainingSessions)
		.where(eq(trainingSessions.date, today))
		.all();

	for (const session of sessions) {
		if (session.cancelled) continue;
		const startMin = parseTimeToMinutes(session.timeStart);
		if (startMin == null) continue;
		const fixMin = startMin - 120; // Voting-Deadline, siehe isVotingOpenForSession
		// Fenster: ab Voting-Schluss bis Trainingsbeginn (verpasst = zu spät)
		if (nowMin < fixMin || nowMin >= startMin) continue;

		// Admin-Spot gesetzt? Dann den melden statt des Voting-Ergebnisses.
		if (session.overrideSpotId) {
			if (!claimReminder(session.id, 'spot')) continue;
			const os = db
				.select({ name: spots.name, city: spots.city })
				.from(spots)
				.where(eq(spots.id, session.overrideSpotId))
				.get();
			if (!os) continue;
			const candidates = attendingUserIds(session.id, session.dayOfWeek);
			if (candidates.length === 0) continue;
			await sendToUsersWithPref(
				'spotFix',
				{
					title: 'Spot fix für heute',
					body: `${os.name} (${os.city}) — Training ${session.timeStart} Uhr.`,
					url: '/training',
					tag: `spot-fix-${session.id}`
				},
				candidates
			);
			continue;
		}

		const votes = db
			.select({ spotId: trainingSpotVotes.spotId, name: spots.name, city: spots.city })
			.from(trainingSpotVotes)
			.innerJoin(spots, eq(spots.id, trainingSpotVotes.spotId))
			.where(eq(trainingSpotVotes.sessionId, session.id))
			.all();
		if (votes.length === 0) continue;

		if (!claimReminder(session.id, 'spot')) continue;

		// Gewinner: meiste Stimmen; bei Gleichstand alphabetisch zuerst.
		const tally = new Map<number, { name: string; city: string; count: number }>();
		for (const v of votes) {
			const e = tally.get(v.spotId) ?? { name: v.name, city: v.city, count: 0 };
			e.count += 1;
			tally.set(v.spotId, e);
		}
		const ranked = [...tally.values()].sort(
			(a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de')
		);
		const winner = ranked[0];
		const tied = ranked.filter((r) => r.count === winner.count);
		const body =
			tied.length > 1
				? `Gleichstand (${winner.count} Stimmen): ${tied.map((t) => t.name).join(' / ')} — klärt es im Chat.`
				: `${winner.name} (${winner.city}) — ${winner.count} ${winner.count === 1 ? 'Stimme' : 'Stimmen'}. Training ${session.timeStart} Uhr.`;

		const candidates = attendingUserIds(session.id, session.dayOfWeek);
		if (candidates.length === 0) continue;
		await sendToUsersWithPref(
			'spotFix',
			{
				title: 'Spot fix für heute',
				body,
				url: '/training',
				tag: `spot-fix-${session.id}`
			},
			candidates
		);
	}
}

async function tick(): Promise<void> {
	try {
		const now = new Date();
		await runEveningReminder(now);
		await runSpotFixNotification(now);
		await runRsvpReminder(now);
		cleanupOldReminderLog();
	} catch (err) {
		console.error('[push] Erinnerungslauf fehlgeschlagen:', err);
	}
}

/** Log-Zeilen vergangener Termine entfernen, damit die Tabelle nicht wächst. */
function cleanupOldReminderLog(): void {
	const cutoff = addDaysYmd(todayYmdInAppTZ(), -60);
	const oldSessions = db
		.select({ id: trainingSessions.id })
		.from(trainingSessions)
		.where(lte(trainingSessions.date, cutoff))
		.all()
		.map((s) => s.id);
	if (oldSessions.length === 0) return;
	db.delete(pushReminderLog).where(inArray(pushReminderLog.sessionId, oldSessions)).run();
}

/** Einmal beim Serverstart aufrufen. Ohne VAPID-Schlüssel passiert nichts. */
export function startPushScheduler(): void {
	if (started) return;
	if (!isPushConfigured()) {
		console.log('[push] Kein VAPID-Schlüssel gesetzt — Erinnerungen sind aus.');
		return;
	}
	started = true;
	// Erster Lauf leicht verzögert, damit der Serverstart nicht blockiert.
	setTimeout(() => void tick(), 30_000);
	const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
	// Node soll wegen des Timers nicht am Beenden gehindert werden.
	if (typeof timer.unref === 'function') timer.unref();
	console.log('[push] Erinnerungen aktiv (Prüfung alle 5 Minuten).');
}

/** Für den manuellen Admin-Auslöser: prüft sofort, ohne auf die volle Stunde zu warten. */
export async function runPushSchedulerNow(): Promise<void> {
	await tick();
}
