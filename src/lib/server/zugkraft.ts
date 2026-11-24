/**
 * Zugkraft — Gruppen-Barometer fürs Dashboard.
 *
 * Misst, wie gut gerade gezogen wird — über drei Kalenderwochen: letzte
 * Woche, diese Woche und nächste Woche (Mo–So). Was schon war, zählt als
 * Tatsache; was noch kommt, mit dem aktuellen Stand der An- und Abmeldungen. Der Sinn ist
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

/**
 * true = Probelauf: nur Admins sehen das Zug-O-Meter und bekommen den
 * Wochenbericht. Seit 23.11.2026 für alle offen.
 */
export const ZUGKRAFT_ADMIN_ONLY = false;

/**
 * Wer sieht das Zug-O-Meter (Startseite, Wochenbericht, Schalter in den
 * Einstellungen)? Admins immer. „Nur Zusage"-Accounts (opt_in) nie — die
 * sind eher Gäste und zählen im Meter selbst auch nicht mit. Alle anderen,
 * solange kein Probelauf läuft.
 */
export function zugkraftVisibleTo(
	user: { role?: string | null; trainingAttendance?: string | null } | null | undefined
): boolean {
	if (!user) return false;
	if (user.role === 'admin') return true;
	if (user.trainingAttendance === 'opt_in') return false;
	return !ZUGKRAFT_ADMIN_ONLY;
}

/**
 * Zug-O-Meter für die Anzeige: null, wenn die Person es nicht sieht — oder
 * wenn die Rechnung scheitert. Dann fällt nur der Block weg, statt die ganze
 * Startseite (Web) bzw. die Trainingsdaten (App) mitzureissen.
 */
export function zugkraftFor(
	user: { role?: string | null; trainingAttendance?: string | null } | null | undefined
): Zugkraft | null {
	if (!zugkraftVisibleTo(user)) return null;
	try {
		return computeZugkraft();
	} catch (err) {
		console.error('[zugkraft] Berechnung fehlgeschlagen:', err);
		return null;
	}
}

/**
 * Bildschirm-Alarm: Bei „Katastrophe" pulsiert ein roter Rahmen um den
 * ganzen Bildschirm — auf jeder Seite, in App und Web, nicht nur beim
 * Zug-O-Meter. true = Probelauf, nur Admins sehen ihn. Seit 24.11.2026 für
 * alle, die das Zug-O-Meter sehen (zugkraftVisibleTo).
 */
export const ZUG_ALARM_ADMIN_ONLY = false;

/** Soll diese Person gerade den roten Rahmen sehen? Nie, wenn die Rechnung scheitert. */
export function zugAlarmFor(
	user: { role?: string | null; trainingAttendance?: string | null } | null | undefined
): boolean {
	if (!user) return false;
	if (ZUG_ALARM_ADMIN_ONLY && user.role !== 'admin') return false;
	return zugkraftFor(user)?.level.key === 'katastrophe';
}

/**
 * Stufen nach dem Schnitt der Köpfe pro Training — angesetzt an der echten
 * Gruppe, nicht an der Theorie: In 45 Trainings (Juni–Nov. 2026) waren nie
 * alle sechs da, fünf nur viermal, der Schnitt liegt bei gut drei. Über drei
 * Wochen gemittelt lag das beste Stück bei ⌀ 3,7. Mit „⌀ 6 = grossartig"
 * hätte die Anzeige darum ewig auf „Geht so" geklebt.
 *
 * Grenzen seit 24.11.2026 (vorher 2,5 / 3,0 / 3,4 / 3,8 / 4,2 — im Winter
 * lag der Schnitt bei 2,3, und das Zug-O-Meter stand dauernd auf
 * Katastrophe samt rotem Bildschirmrahmen): Katastrophe unter ⌀ 2,0,
 * Sehr schwach 2,0–2,6, Geht so 2,7–3,0, Gut 3,1–3,4, Super 3,5–3,9,
 * Grossartig ab 4,0 — knapp über dem Rekord von 3,7, also ein echtes Ziel.
 * Verglichen wird der angezeigte Schnitt (eine Nachkommastelle, siehe
 * computeZugkraft), damit ⌀ 2,7 in der Anzeige auch „Geht so" ist.
 * Untere Grenze jeweils inklusive.
 */
export const LEVEL_MIN: Record<ZugkraftLevelKey, number> = {
	grossartig: 4.0,
	super: 3.5,
	gut: 3.1,
	ok: 2.7,
	schwach: 2.0,
	katastrophe: 0
};
/** Stufen von oben nach unten. */
const LEVEL_ORDER: ZugkraftLevelKey[] = ['grossartig', 'super', 'gut', 'ok', 'schwach', 'katastrophe'];

/** Montag der Woche (JJJJ-MM-TT) — Wochen laufen Mo–So. */
function mondayOf(ymd: string): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sonntag
	return addDays(ymd, -((dow + 6) % 7));
}

/**
 * Balkenfüllung 0–100 als Anzeige der Stufe: Jede Stufe bekommt ein gleich
 * breites Sechstel. Unterhalb von „grossartig" wird innerhalb der Stufe
 * anteilig gefüllt, damit man auch kleine Bewegungen sieht; „grossartig"
 * ist immer ganz voll — roh in Prozent der Mitglieder wäre es nur ein zu
 * zwei Dritteln voller Balken.
 */
export function fillFor(avg: number): number {
	if (avg >= LEVEL_MIN.grossartig) return 100;
	const bounds = [...LEVEL_ORDER].reverse().map((k) => LEVEL_MIN[k]); // katastrophe … grossartig
	for (let i = 0; i < bounds.length - 1; i++) {
		if (avg < bounds[i + 1]) {
			const within = Math.min(1, Math.max(0, (avg - bounds[i]) / (bounds[i + 1] - bounds[i])));
			return Math.round(((i + within) / bounds.length) * 100);
		}
	}
	return 100;
}

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
	/** Anwesenheit in Prozent der Mitglieder (für den Trend). */
	percent: number;
	/** Balkenfüllung 0–100 — zeigt die Stufe, siehe fillFor(). */
	fill: number;
	level: ZugkraftLevel;
	/** Prozentpunkte gegenüber den drei Wochen davor (nur Vergangenheit, fairer Vergleich). */
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
 * Stufe aus dem Schnitt der Köpfe (Grenzen in LEVEL_MIN). Ist die Gruppe
 * klein und sind trotzdem alle da, gilt das immer als grossartig.
 */
function levelFor(avg: number, members: number): ZugkraftLevel {
	const alleDa = members > 0 && avg >= members - 0.25;
	if (avg >= LEVEL_MIN.grossartig || alleDa)
		return {
			key: 'grossartig',
			label: 'Grossartig',
			emoji: '🔥🔥🔥',
			blurb: 'Maximaler Zug!!!',
			intensity: 2
		};
	if (avg >= LEVEL_MIN.super)
		return {
			key: 'super',
			label: 'Super',
			emoji: '🔥',
			blurb: 'Zugmodus aktiviert!',
			intensity: 1
		};
	if (avg >= LEVEL_MIN.gut)
		return {
			key: 'gut',
			label: 'Gut',
			emoji: '💪',
			blurb: 'Der Zug kommt ins Rollen',
			intensity: 0
		};
	if (avg >= LEVEL_MIN.ok)
		return {
			key: 'ok',
			label: 'Geht so',
			emoji: '😬',
			blurb: 'Wo ist der Zug?',
			intensity: 0
		};
	if (avg >= LEVEL_MIN.schwach)
		return {
			key: 'schwach',
			label: 'Sehr schwach',
			emoji: '😭',
			blurb: 'Der Zug steht still.',
			intensity: 2
		};
	return {
		key: 'katastrophe',
		label: 'Katastrophe',
		emoji: '💀',
		blurb: 'Zugausfall!',
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

	// Letzte, diese und nächste Woche (Mo–So) — immer drei volle Wochen,
	// also normalerweise sechs Trainings, egal an welchem Tag man schaut.
	const windowStart = addDays(mondayOf(today), -7);
	const windowEnd = addDays(mondayOf(today), 13);
	const past = sessionsBetween(windowStart, today, false);
	const upcoming = sessionsBetween(today, windowEnd, true);
	// Vergleich für den Trend: die drei Wochen davor.
	const previous = sessionsBetween(addDays(windowStart, -21), windowStart, false);

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
	// das ist die Zahl, die die Stufe bestimmt. Gerundet wie angezeigt, damit
	// Anzeige und Stufe zusammenpassen (16 Köpfe in 6 Trainings = ⌀ 2,7 →
	// „Geht so", nicht 2,67 → „Sehr schwach").
	const avgAll =
		all.length > 0 ? Math.round(((pastRes.sum + upcomingRes.sum) / all.length) * 10) / 10 : 0;
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
		fill: level.key === 'grossartig' ? 100 : fillFor(avgAll),
		level,
		trend,
		memberCount: ctx.members.length,
		pastCount: past.length,
		upcomingCount: upcoming.length,
		avgPast,
		avgAvailable,
		avgAll,
		avgUpcoming,
		sessions,
		headline: `${level.emoji} Zug-O-Meter: ${level.label}`
	};
}

/** „3.6" → „3,6" */
const de1 = (n: number) => n.toFixed(1).replace('.', ',');

/**
 * Alle sechs Stufen als Muster — für die Admin-Vorschau in Web und App.
 * Gleiche Stufenlogik und Balkenfüllung wie echt, damit die Vorschau nicht
 * lügt; `range` sagt, ab welchem Schnitt die Stufe gilt.
 */
export function zugkraftPreview(): {
	key: ZugkraftLevelKey;
	range: string;
	avg: number;
	percent: number;
	fill: number;
	level: ZugkraftLevel;
}[] {
	return LEVEL_ORDER.map((key, i) => {
		const min = LEVEL_MIN[key];
		const above = i === 0 ? min + 0.6 : LEVEL_MIN[LEVEL_ORDER[i - 1]];
		// Musterwert: Mitte der Stufe (ganz unten etwas unter der Grenze).
		const avg =
			key === 'katastrophe' ? Math.max(0, above - 0.5) : Math.round(((min + above) / 2) * 100) / 100;
		const range =
			key === 'grossartig'
				? `ab ⌀ ${de1(min)}`
				: key === 'katastrophe'
					? `unter ⌀ ${de1(above)}`
					: `⌀ ${de1(min)} – ${de1(above - 0.1)}`;
		return {
			key,
			range,
			avg,
			percent: Math.round((avg / 6) * 100),
			fill: fillFor(avg),
			level: levelFor(avg, 6)
		};
	});
}

/** Text für die Wochen-Benachrichtigung (Sonntagabend). */
export function zugkraftPushText(z: Zugkraft): { title: string; body: string } {
	// Keine Kopfzahlen im Text — Emoji, Stufe und Spruch sagen genug.
	const trendText = z.trend > 4 ? 'Tendenz: aufwärts 📈' : z.trend < -4 ? 'Tendenz: abwärts 📉' : '';
	return {
		title: `${z.level.emoji} Zug-O-Meter: ${z.level.label}`,
		// Die Sprüche sind kurz und teils ohne Satzzeichen — darum mit Strich anhängen.
		body: trendText ? `${z.level.blurb} — ${trendText}` : z.level.blurb
	};
}
