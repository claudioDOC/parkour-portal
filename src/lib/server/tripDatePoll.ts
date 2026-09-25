/**
 * Terminumfrage für Trips.
 *
 * Statt einer einzigen Stimme sagt jede Person bei jedem Datum
 * ja / notfalls / nein. Regeln:
 *
 *  - Erreicht ein Datum MIN_YES „Ja", ist der Termin sofort fix. Wer „Ja"
 *    gesagt hat, ist damit angemeldet; „Notfalls" wird beim nächsten
 *    App-Start gefragt.
 *  - Spätestens mit der Frist entscheidet der Server: meiste „Ja", bei
 *    Gleichstand meiste „Notfalls", dann das frühere Datum. Fehlen drei
 *    „Ja", bleibt der Trip offen und wird fix, sobald das dritte kommt.
 *  - Wer bis zur Frist nichts gesagt hat, sieht nur noch das Datum — die
 *    Details gibt es erst mit der Zusage.
 *  - Nach der Fixierung kann nur der Ersteller oder ein Admin neu
 *    aufrollen (mit neuer Frist). Einzelne sagen für sich ab, kippen den
 *    Termin aber nicht mehr.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	tripDateAnswers,
	tripDateOptions,
	tripParticipants,
	tripPlans,
	users
} from '$lib/server/db/schema';
import { recordEvent } from '$lib/server/activity';
import { sendToUsersWithPref } from '$lib/server/push';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';

export const MIN_YES = 3;
export const DEFAULT_DEADLINE_DAYS = 7;

export type DateAnswer = 'ja' | 'notfalls' | 'nein';
export const DATE_ANSWERS: DateAnswer[] = ['ja', 'notfalls', 'nein'];

/** Frist als UTC-Text wie SQLites datetime('now'): 'YYYY-MM-DD HH:MM:SS'. */
export function toDbDatetime(d: Date): string {
	return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Ein Datum (JJJJ-MM-TT) aus dem Formular wird zur Frist „Ende dieses Tages". */
export function deadlineFromYmd(ymd: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
	const d = new Date(`${ymd}T23:59:00`);
	return Number.isNaN(d.getTime()) ? null : toDbDatetime(d);
}

export function defaultDeadline(now = new Date()): string {
	const d = new Date(now.getTime() + DEFAULT_DEADLINE_DAYS * 86_400_000);
	d.setHours(23, 59, 0, 0);
	return toDbDatetime(d);
}

export function parseDbDatetime(s: string | null | undefined): Date | null {
	if (!s) return null;
	const d = new Date(s.replace(' ', 'T') + 'Z');
	return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRange(start: string, end: string): string {
	const fmt = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });
	return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/** Das Datum des Trips selbst als Option — legt sie an, falls sie fehlt. */
export function ensureOwnDateOption(tripId: number): number {
	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip) throw new Error('Trip nicht gefunden');
	const existing = db
		.select({ id: tripDateOptions.id })
		.from(tripDateOptions)
		.where(
			and(
				eq(tripDateOptions.tripId, tripId),
				eq(tripDateOptions.startDate, trip.startDate),
				eq(tripDateOptions.endDate, trip.endDate)
			)
		)
		.get();
	if (existing) return existing.id;
	return db
		.insert(tripDateOptions)
		.values({
			tripId,
			startDate: trip.startDate,
			endDate: trip.endDate,
			note: null,
			proposedBy: trip.createdBy
		})
		.returning({ id: tripDateOptions.id })
		.get().id;
}

export function isTripLocked(trip: { dateLockedAt: string | null }): boolean {
	return Boolean(trip.dateLockedAt);
}

/** Antwort setzen — nach der Fixierung nicht mehr möglich. */
export function answerDateOption(params: {
	tripId: number;
	dateOptionId: number;
	userId: number;
	answer: DateAnswer;
}): { locked: LockResult | null } {
	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, params.tripId)).get();
	if (!trip) throw new Error('Trip nicht gefunden');
	if (isTripLocked(trip)) throw new Error('Der Termin ist fix — die Umfrage ist geschlossen.');
	const option = db
		.select({ id: tripDateOptions.id })
		.from(tripDateOptions)
		.where(and(eq(tripDateOptions.id, params.dateOptionId), eq(tripDateOptions.tripId, params.tripId)))
		.get();
	if (!option) throw new Error('Datums-Vorschlag nicht gefunden');
	db.insert(tripDateAnswers)
		.values({
			tripId: params.tripId,
			dateOptionId: params.dateOptionId,
			userId: params.userId,
			answer: params.answer
		})
		.onConflictDoUpdate({
			target: [tripDateAnswers.dateOptionId, tripDateAnswers.userId],
			set: { answer: params.answer, updatedAt: sql`(datetime('now'))` }
		})
		.run();
	return { locked: evaluateTripLock(params.tripId, { force: false }) };
}

/**
 * Zusage/Absage am Trip spiegelt sich in der Umfrage: „dabei" heisst Ja zum
 * geplanten Datum, „nicht dabei" heisst Nein zu allen. „Dabei, wenn …"
 * (bedingt) sagt bewusst nichts — die Bedingung ist meist ein anderes Datum,
 * und das sagt die Person in der Umfrage selbst. Nach der Fixierung bleibt
 * die Umfrage unangetastet.
 */
export function mirrorParticipationIntoPoll(
	tripId: number,
	userId: number,
	answer: 'ja' | 'nein' | null
): void {
	if (answer === null) return;
	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip || isTripLocked(trip)) return;
	if (answer === 'ja') {
		const optionId = ensureOwnDateOption(tripId);
		db.insert(tripDateAnswers)
			.values({ tripId, dateOptionId: optionId, userId, answer: 'ja' })
			.onConflictDoUpdate({
				target: [tripDateAnswers.dateOptionId, tripDateAnswers.userId],
				set: { answer: 'ja', updatedAt: sql`(datetime('now'))` }
			})
			.run();
	} else {
		const options = db
			.select({ id: tripDateOptions.id })
			.from(tripDateOptions)
			.where(eq(tripDateOptions.tripId, tripId))
			.all();
		for (const o of options) {
			db.insert(tripDateAnswers)
				.values({ tripId, dateOptionId: o.id, userId, answer: 'nein' })
				.onConflictDoUpdate({
					target: [tripDateAnswers.dateOptionId, tripDateAnswers.userId],
					set: { answer: 'nein', updatedAt: sql`(datetime('now'))` }
				})
				.run();
		}
	}
}

export type Tally = {
	optionId: number;
	startDate: string;
	endDate: string;
	yes: number;
	maybe: number;
	no: number;
};

export function tallyTrip(tripId: number): Tally[] {
	const options = db
		.select({ id: tripDateOptions.id, startDate: tripDateOptions.startDate, endDate: tripDateOptions.endDate })
		.from(tripDateOptions)
		.where(eq(tripDateOptions.tripId, tripId))
		.orderBy(asc(tripDateOptions.startDate), asc(tripDateOptions.id))
		.all();
	const answers = db
		.select({ dateOptionId: tripDateAnswers.dateOptionId, answer: tripDateAnswers.answer, userId: tripDateAnswers.userId })
		.from(tripDateAnswers)
		.innerJoin(users, eq(users.id, tripDateAnswers.userId))
		.where(and(eq(tripDateAnswers.tripId, tripId), usersNotDeletedCondition()))
		.all();
	return options.map((o) => {
		const mine = answers.filter((a) => a.dateOptionId === o.id);
		return {
			optionId: o.id,
			startDate: o.startDate,
			endDate: o.endDate,
			yes: mine.filter((a) => a.answer === 'ja').length,
			maybe: mine.filter((a) => a.answer === 'notfalls').length,
			no: mine.filter((a) => a.answer === 'nein').length
		};
	});
}

/** Reihenfolge: meiste Ja, dann meiste Notfalls, dann das frühere Datum. */
export function rankTally(t: Tally[]): Tally[] {
	return [...t].sort(
		(a, b) => b.yes - a.yes || b.maybe - a.maybe || a.startDate.localeCompare(b.startDate)
	);
}

export type LockResult = {
	tripId: number;
	title: string;
	optionId: number;
	startDate: string;
	endDate: string;
	yes: number;
	joinedUserIds: number[];
	/** 'yes' = drittes Ja · 'deadline' = Frist abgelaufen */
	reason: 'yes' | 'deadline';
};

/**
 * Fixiert den Termin, wenn die Regeln es hergeben. `force` steht für die
 * abgelaufene Frist: dann genügt die Spitzenreiterin, sofern sie MIN_YES hat.
 */
export function evaluateTripLock(tripId: number, opts: { force: boolean }): LockResult | null {
	const trip = db.select().from(tripPlans).where(eq(tripPlans.id, tripId)).get();
	if (!trip || isTripLocked(trip)) return null;
	const ranked = rankTally(tallyTrip(tripId));
	const leader = ranked[0];
	if (!leader || leader.yes < MIN_YES) return null;
	if (!opts.force) {
		// Ohne Frist zählt nur, dass ein Datum die Hürde nimmt. Nehmen zwei sie
		// gleichzeitig (Nachtrag alter Daten), gilt dieselbe Rangfolge.
	}

	db.update(tripPlans)
		.set({
			startDate: leader.startDate,
			endDate: leader.endDate,
			dateLockedAt: sql`(datetime('now'))`,
			lockedDateOptionId: leader.optionId
		})
		.where(eq(tripPlans.id, tripId))
		.run();

	// Wer Ja gesagt hat, ist dabei — ohne zweiten Klick.
	const yesUsers = db
		.select({ userId: tripDateAnswers.userId })
		.from(tripDateAnswers)
		.where(and(eq(tripDateAnswers.dateOptionId, leader.optionId), eq(tripDateAnswers.answer, 'ja')))
		.all()
		.map((r) => r.userId);
	const joined: number[] = [];
	for (const uid of yesUsers) {
		const part = db
			.select({ id: tripParticipants.id, transportMode: tripParticipants.transportMode })
			.from(tripParticipants)
			.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, uid)))
			.get();
		if (!part) {
			db.insert(tripParticipants)
				.values({ tripId, userId: uid, transportMode: 'dabei', decidedAt: sql`(datetime('now'))` })
				.run();
			joined.push(uid);
		} else if (part.transportMode === 'enthalten') {
			db.update(tripParticipants)
				.set({ transportMode: 'dabei', decidedAt: sql`(datetime('now'))` })
				.where(eq(tripParticipants.id, part.id))
				.run();
			joined.push(uid);
		}
	}

	const result: LockResult = {
		tripId,
		title: trip.title,
		optionId: leader.optionId,
		startDate: leader.startDate,
		endDate: leader.endDate,
		yes: leader.yes,
		joinedUserIds: joined,
		reason: opts.force ? 'deadline' : 'yes'
	};
	const range = formatRange(leader.startDate, leader.endDate);
	recordEvent({
		kind: 'trip.date_fixed',
		actorUserId: null,
		actorName: null,
		title: `Termin fix: ${trip.title}`,
		body: `${range} · ${leader.yes} Zusagen${opts.force ? ' · Frist abgelaufen' : ''}. Ab jetzt: mitkommen oder nicht — der Termin steht.`,
		url: `/trips?trip=${tripId}`
	});
	void sendToUsersWithPref('trips', {
		title: `Termin fix: ${trip.title}`,
		body: `${range} — ${leader.yes} Zusagen. Jetzt in den Kalender!`,
		url: `/trips?trip=${tripId}`,
		tag: `trip-date-${tripId}`
	}).catch(() => undefined);
	return result;
}

/** Termin neu aufrollen: Fixierung weg, neue Frist. Nur Ersteller/Admin (prüft der Aufrufer). */
export function unlockTrip(tripId: number, deadline: string): void {
	db.update(tripPlans)
		.set({ dateLockedAt: null, lockedDateOptionId: null, deadlineHandledAt: null, voteDeadline: deadline })
		.where(eq(tripPlans.id, tripId))
		.run();
}

/** Hat die Person zum Trip überhaupt etwas gesagt (Umfrage oder Zu-/Absage)? */
export function hasResponded(tripId: number, userId: number): boolean {
	const a = db
		.select({ id: tripDateAnswers.id })
		.from(tripDateAnswers)
		.where(and(eq(tripDateAnswers.tripId, tripId), eq(tripDateAnswers.userId, userId)))
		.get();
	if (a) return true;
	const p = db
		.select({ transportMode: tripParticipants.transportMode })
		.from(tripParticipants)
		.where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, userId)))
		.get();
	return Boolean(p && p.transportMode !== 'enthalten');
}

/**
 * Eingeschränkte Sicht: Frist vorbei, nichts gesagt, noch nicht zugesagt.
 * Gilt auch nach der Fixierung — wer schweigt, sieht bis zur Zusage nur
 * das Datum.
 */
export function isRestrictedView(
	trip: { id: number; voteDeadline: string | null },
	userId: number,
	now = new Date()
): boolean {
	const deadline = parseDbDatetime(trip.voteDeadline);
	if (!deadline || now < deadline) return false;
	return !hasResponded(trip.id, userId);
}

/** Mitglieder ohne Antwort — für „noch offen: …" und die Erinnerung. */
export function silentMemberIds(tripId: number): number[] {
	const members = db
		.select({ id: users.id })
		.from(users)
		.where(usersNotDeletedCondition())
		.all()
		.map((u) => u.id);
	return members.filter((id) => !hasResponded(tripId, id));
}

export type NextTripSummary = {
	id: number;
	title: string;
	startDate: string;
	endDate: string;
	locked: boolean;
	deadline: string | null;
	deadlinePassed: boolean;
	hasResponded: boolean;
	/** Umfrage mit mehreren Daten, noch nicht fix. */
	pollOpen: boolean;
	leaderYes: number;
	minYes: number;
	joinedCount: number;
};

/**
 * Der nächste geplante Trip in einer Zeile — für Startseite und App-Start.
 * Kein eigener Block, nur ein Hinweis: Titel, Datum, Stand der Umfrage.
 */
export function nextTripSummary(userId: number, today: string): NextTripSummary | null {
	const trip = db
		.select({
			id: tripPlans.id,
			title: tripPlans.title,
			startDate: tripPlans.startDate,
			endDate: tripPlans.endDate,
			voteDeadline: tripPlans.voteDeadline,
			dateLockedAt: tripPlans.dateLockedAt
		})
		.from(tripPlans)
		.where(and(eq(tripPlans.deleted, false), sql`${tripPlans.endDate} >= ${today}`))
		.orderBy(asc(tripPlans.startDate))
		.get();
	if (!trip) return null;
	const ranked = rankTally(tallyTrip(trip.id));
	const optionCount = ranked.length;
	const deadline = parseDbDatetime(trip.voteDeadline);
	const joinedCount = db
		.select({ transportMode: tripParticipants.transportMode })
		.from(tripParticipants)
		.where(eq(tripParticipants.tripId, trip.id))
		.all()
		.filter((p) => p.transportMode !== 'abgemeldet' && p.transportMode !== 'enthalten').length;
	return {
		id: trip.id,
		title: trip.title,
		startDate: trip.startDate,
		endDate: trip.endDate,
		locked: Boolean(trip.dateLockedAt),
		deadline: trip.voteDeadline,
		deadlinePassed: deadline ? Date.now() >= deadline.getTime() : false,
		hasResponded: hasResponded(trip.id, userId),
		pollOpen: !trip.dateLockedAt && optionCount > 1,
		leaderYes: ranked[0]?.yes ?? 0,
		minYes: MIN_YES,
		joinedCount
	};
}
