/**
 * Zugkraft — Gruppen-Barometer fürs Dashboard.
 *
 * Misst, wie gut gerade gezogen wird: die letzten 14 Tage (was tatsächlich
 * war) plus die kommenden 7 Tage (was aktuell angesagt ist). Der Sinn ist
 * nicht Statistik, sondern Druck in die richtige Richtung: Wer sieht, dass
 * die Gruppe gerade schwach zieht, soll sich zweimal überlegen, ob er sich
 * auch noch abmeldet.
 *
 * Nur reguläre, nicht abgesagte Trainings zählen. Zusatztrainings bleiben
 * draussen — die sind freiwillig und würden das Bild verfälschen.
 */
import { and, asc, eq, gte, lte, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	absences,
	sessionHiddenUsers,
	trainingSessionRsvp,
	trainingSessionWeekdayOverride,
	trainingSessions,
	users
} from '$lib/server/db/schema';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import {
	computeEffectiveAbsentUserIds,
	isListedAsAttending,
	normalizeUserForAttendance,
	type UserForAttendance
} from '$lib/server/trainingAttendance';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

/** Solange true, sehen nur Admins das Barometer (Probelauf). */
export const ZUGKRAFT_ADMIN_ONLY = true;

export const PAST_DAYS = 14;
export const FUTURE_DAYS = 7;

export type ZugkraftLevelKey =
	| 'grossartig'
	| 'super'
	| 'gut'
	| 'ok'
	| 'schwach'
	| 'katastrophe';

export type ZugkraftLevel = {
	key: ZugkraftLevelKey;
	label: string;
	emoji: string;
	/** Kurzer Spruch — direkt an die Gruppe gerichtet. */
	blurb: string;
	/** Wie heftig die Darstellung sein soll: 0 = ruhig, 2 = Alarm/Feuerwerk. */
	intensity: 0 | 1 | 2;
};

export type ZugkraftSession = {
	sessionId: number;
	date: string;
	dayOfWeek: string;
	isPast: boolean;
	attending: number;
	total: number;
	percent: number;
};

export type Zugkraft = {
	percent: number;
	level: ZugkraftLevel;
	/** Prozentpunkte gegenüber den 14 Tagen davor (nur Vergangenheit, fairer Vergleich). */
	trend: number;
	memberCount: number;
	pastCount: number;
	upcomingCount: number;
	/** Schnitt der vergangenen Trainings im Fenster (Personen pro Training). */
	avgPast: number;
	/** Nenner: aktive Mitglieder, die mitspielen. */
	avgAvailable: number;
	/** Schnitt über das ganze Fenster — bestimmt die Stufe. */
	avgAll: number;
	/** Erwarteter Schnitt der kommenden Trainings. */
	avgUpcoming: number;
	sessions: ZugkraftSession[];
	/** Eine Zeile für Push und Kurzanzeige. */
	headline: string;
};

function addDays(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Stufe nach KÖPFEN, nicht nach Prozent.
 *
 * Entscheidend ist, wie viele am Spot stehen: Sechs ist grossartig, fünf
 * super, vier gut, drei geht so, zwei ist sehr schwach — und bei einem
 * trainiert faktisch niemand, weil allein keiner Lust hat. Prozent allein
 * würde täuschen: „50 %" klingt solide, sind aber bloss drei von sechs.
 *
 * `members` deckelt die Spitze: Ist die Gruppe kleiner, gilt „alle da"
 * trotzdem als grossartig.
 */
function levelFor(avg: number, members: number): ZugkraftLevel {
	const alleDa = members > 0 && avg >= members - 0.25;
	if (avg >= 5.5 || alleDa)
		return {
			key: 'grossartig',
			label: 'Grossartig',
			emoji: '🏆',
			blurb: 'Volle Hütte. Mehr geht nicht — so muss das sein.',
			intensity: 2
		};
	if (avg >= 4.5)
		return {
			key: 'super',
			label: 'Super',
			emoji: '🔥',
			blurb: 'Fünf am Start. Die Gruppe brennt gerade.',
			intensity: 1
		};
	if (avg >= 3.5)
		return {
			key: 'gut',
			label: 'Gut',
			emoji: '💪',
			blurb: 'Vier ziehen mit — gute Trainings. Haltet das.',
			intensity: 0
		};
	if (avg >= 2.5)
		return {
			key: 'ok',
			label: 'Geht so',
			emoji: '👍',
			blurb: 'Drei am Spot. Reicht zum Trainieren, mehr wäre deutlich besser.',
			intensity: 0
		};
	if (avg >= 1.5)
		return {
			key: 'schwach',
			label: 'Sehr schwach',
			emoji: '😬',
			blurb: 'Nur noch zwei. Jetzt bloss nicht auch noch abmelden.',
			intensity: 2
		};
	return {
		key: 'katastrophe',
		label: 'Katastrophe',
		emoji: '💀',
		blurb: 'Fast niemand zieht. Allein trainiert keiner — das stirbt gerade weg.',
		intensity: 2
	};
}

type Ctx = {
	members: UserForAttendance[];
	absencePairs: Set<string>;
	rsvpPairs: Set<string>;
	overridePairs: Set<string>;
	hiddenPairs: Set<string>;
};

function loadContext(): Ctx {
	const members = db
		.select({
			id: users.id,
			username: users.username,
			active: users.active,
			trainingAttendance: users.trainingAttendance,
			autoAbsentWeekdays: users.autoAbsentWeekdays
		})
		.from(users)
		.where(and(usersNotDeletedCondition(), eq(users.active, true)))
		.all()
		.map(normalizeUserForAttendance);

	const pair = (a: number, b: number) => `${a}:${b}`;
	const absencePairs = new Set(
		db.select({ u: absences.userId, s: absences.sessionId }).from(absences).all().map((r) => pair(r.u, r.s))
	);
	const rsvpPairs = new Set(
		db
			.select({ u: trainingSessionRsvp.userId, s: trainingSessionRsvp.sessionId })
			.from(trainingSessionRsvp)
			.all()
			.map((r) => pair(r.u, r.s))
	);
	const overridePairs = new Set(
		db
			.select({ u: trainingSessionWeekdayOverride.userId, s: trainingSessionWeekdayOverride.sessionId })
			.from(trainingSessionWeekdayOverride)
			.all()
			.map((r) => pair(r.u, r.s))
	);
	const hiddenPairs = new Set(
		db
			.select({ u: sessionHiddenUsers.userId, s: sessionHiddenUsers.sessionId })
			.from(sessionHiddenUsers)
			.all()
			.map((r) => pair(r.u, r.s))
	);
	return { members, absencePairs, rsvpPairs, overridePairs, hiddenPairs };
}

/**
 * Wie viele ziehen mit? Nenner sind ALLE Mitglieder — auch wer eine stehende
 * Wochentags-Abmeldung hat. Das ist bewusst hart: Ein Donnerstag, an dem zwei
 * Leute grundsätzlich nie kommen, IST schwächer besetzt, und genau das soll
 * die Zahl zeigen. Die Stufen sind dafür entsprechend angesetzt.
 */
function attendingCount(
	ctx: Ctx,
	session: { id: number; dayOfWeek: string }
): { attending: number; available: number } {
	const dbAbsent = new Set(ctx.members.filter((u) => ctx.absencePairs.has(`${u.id}:${session.id}`)).map((u) => u.id));
	const overrides = new Set(
		ctx.members.filter((u) => ctx.overridePairs.has(`${u.id}:${session.id}`)).map((u) => u.id)
	);
	const hidden = new Set(ctx.members.filter((u) => ctx.hiddenPairs.has(`${u.id}:${session.id}`)).map((u) => u.id));
	const rsvp = new Set(ctx.members.filter((u) => ctx.rsvpPairs.has(`${u.id}:${session.id}`)).map((u) => u.id));
	const effectiveAbsent = computeEffectiveAbsentUserIds(ctx.members, session.dayOfWeek, dbAbsent, overrides);
	const attending = ctx.members.filter((u) => isListedAsAttending(u, effectiveAbsent, hidden, rsvp, false)).length;
	return { attending, available: ctx.members.length };
}

function sessionsBetween(from: string, toExclusiveOrInclusive: string, inclusive: boolean) {
	return db
		.select({
			id: trainingSessions.id,
			date: trainingSessions.date,
			dayOfWeek: trainingSessions.dayOfWeek,
			cancelled: trainingSessions.cancelled,
			isExtra: trainingSessions.isExtra
		})
		.from(trainingSessions)
		.where(
			and(
				gte(trainingSessions.date, from),
				inclusive
					? lte(trainingSessions.date, toExclusiveOrInclusive)
					: lt(trainingSessions.date, toExclusiveOrInclusive),
				eq(trainingSessions.isExtra, false),
				eq(trainingSessions.cancelled, false)
			)
		)
		.orderBy(asc(trainingSessions.date))
		.all();
}

/** Prozent über eine Session-Liste: Mitziehende / verfügbare Plätze. */
function percentOver(
	ctx: Ctx,
	list: { id: number; dayOfWeek: string }[]
): { percent: number; sum: number } {
	if (list.length === 0 || ctx.members.length === 0) return { percent: 0, sum: 0 };
	let sum = 0;
	let slots = 0;
	for (const s of list) {
		const c = attendingCount(ctx, s);
		sum += c.attending;
		slots += c.available;
	}
	return { percent: slots > 0 ? Math.round((sum / slots) * 100) : 0, sum };
}

export function computeZugkraft(now = new Date()): Zugkraft {
	const today = todayYmdInAppTZ(now);
	const ctx = loadContext();

	const past = sessionsBetween(addDays(today, -PAST_DAYS), today, false);
	const upcoming = sessionsBetween(today, addDays(today, FUTURE_DAYS), true);
	const previous = sessionsBetween(addDays(today, -2 * PAST_DAYS), addDays(today, -PAST_DAYS), false);

	// Wer im Zusage-Modus läuft und im ganzen Fenster nie geantwortet hat,
	// gehört nicht in den Nenner: Sonst wäre 100 % unerreichbar und die
	// Gruppe bekäme schlechte Noten für jemanden, der gar nicht mitspielt.
	// Bei Accounts im Standardmodus gilt „nicht abgemeldet = dabei", die
	// können also nie stumm sein — hier wird nur der Sonderfall behandelt.
	// Nur das gemessene Fenster zaehlt — wer im Vorfenster einmal geantwortet
	// hat, soll den Nenner nicht fuer immer belasten.
	const windowIds = [...past, ...upcoming].map((s) => s.id);
	ctx.members = ctx.members.filter((u) => {
		if (u.trainingAttendance !== 'opt_in') return true;
		return windowIds.some(
			(sid) => ctx.rsvpPairs.has(`${u.id}:${sid}`) || ctx.absencePairs.has(`${u.id}:${sid}`)
		);
	});

	const all = [...past, ...upcoming];
	const { percent } = percentOver(ctx, all);
	const pastRes = percentOver(ctx, past);
	const upcomingRes = percentOver(ctx, upcoming);
	const prevRes = percentOver(ctx, previous);

	const sessions: ZugkraftSession[] = all.map((s) => {
		const { attending, available } = attendingCount(ctx, s);
		return {
			sessionId: s.id,
			date: s.date,
			dayOfWeek: s.dayOfWeek,
			isPast: s.date < today,
			attending,
			total: available,
			percent: available > 0 ? Math.round((attending / available) * 100) : 0
		};
	});

	// Schnitt über das gesamte Fenster (Vergangenheit + kommende Woche) —
	// das ist die Zahl, die die Stufe bestimmt.
	const avgAll =
		all.length > 0 ? (pastRes.sum + upcomingRes.sum) / all.length : 0;
	const level = levelFor(avgAll, ctx.members.length);
	const avgPast = past.length > 0 ? Math.round((pastRes.sum / past.length) * 10) / 10 : 0;
	const availableSum = all.reduce((acc, s) => acc + attendingCount(ctx, s).available, 0);
	const avgAvailable = all.length > 0 ? Math.round((availableSum / all.length) * 10) / 10 : 0;
	const avgUpcoming = upcoming.length > 0 ? Math.round((upcomingRes.sum / upcoming.length) * 10) / 10 : 0;
	// Trend nur über die Vergangenheit: Kommende Termine sind Absichten, keine
	// Tatsachen — sie würden den Vergleich beliebig machen.
	const trend = past.length > 0 && previous.length > 0 ? pastRes.percent - prevRes.percent : 0;

	return {
		percent,
		level,
		trend,
		memberCount: ctx.members.length,
		pastCount: past.length,
		upcomingCount: upcoming.length,
		avgPast,
		avgAvailable,
		avgAll: Math.round(avgAll * 10) / 10,
		avgUpcoming,
		sessions,
		headline: `${level.emoji} Zugkraft: ⌀ ${Math.round(avgAll * 10) / 10} von ${ctx.members.length} — ${level.label}`
	};
}

/** Text für die Wochen-Benachrichtigung (Sonntagabend). */
export function zugkraftPushText(z: Zugkraft): { title: string; body: string } {
	const trendText =
		z.trend > 4 ? ` (↑ ${z.trend} Punkte)` : z.trend < -4 ? ` (↓ ${Math.abs(z.trend)} Punkte)` : '';
	return {
		title: `${z.level.emoji} Zugkraft: ⌀ ${z.avgAll} von ${z.memberCount} — ${z.level.label}`,
		body:
			`Letzte 2 Wochen im Schnitt ${z.avgPast} dabei, kommende Woche ${z.avgUpcoming}${trendText}. ` +
			z.level.blurb
	};
}
