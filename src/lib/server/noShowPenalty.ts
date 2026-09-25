/**
 * Strafrunde für stilles Fernbleiben.
 *
 * Wer ohne Abmeldung nicht auftaucht, wird nicht bürokratisch bestraft,
 * sondern spielerisch — und automatisch, sobald ein Admin „nicht
 * erschienen" einträgt:
 *
 *  1. Warnhinweis beim Öffnen (20 Sekunden nicht wegklickbar), bis der Spot
 *     fürs nächste Training fix ist.
 *  2. „Wer zieht" zeigt bis nach dem Training nur Fragezeichen.
 *  3. Nur auf Stufe 2: Beim nächsten Training sieht die Person einen
 *     falschen Spot — den nächstgelegenen anderen, damit sie spontan noch
 *     rüberkommen kann. Die Warnung verrät das nicht, sie droht nur vage
 *     „weitere Konsequenzen" an.
 *
 * Die Stufen wechseln sich ab (1, 2, 1, 2 …), gezählt über alle bisherigen
 * Strafen der Person, ohne Verfallsdatum. Die Strafe endet mit dem
 * Straf-Training von selbst. Pro Person läuft höchstens eine; ein weiteres
 * Fernbleiben währenddessen stapelt nichts.
 */
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { noShowPenalties, spots, trainingSessions, users } from '$lib/server/db/schema';
import { recordEvent } from '$lib/server/activity';
import { sendToUsers } from '$lib/server/push';

type SessionRow = {
	id: number;
	date: string;
	dayOfWeek: string;
	timeStart: string;
	timeEnd: string;
	cancelled: boolean | null;
};

export type PenaltyPhase = 'warning' | 'wrongSpot';

export type ActivePenalty = {
	id: number;
	userId: number;
	/** 1 = Fragezeichen · 2 = Fragezeichen + falscher Spot */
	stage: 1 | 2;
	missed: { id: number; date: string; dayOfWeek: string };
	penalty: { id: number; date: string; dayOfWeek: string; timeStart: string; timeEnd: string };
	/** warning: bis der Spot fürs Straf-Training fix ist · wrongSpot: ab dann bis Trainingsende */
	phase: PenaltyPhase;
};

const SESSION_COLS = {
	id: trainingSessions.id,
	date: trainingSessions.date,
	dayOfWeek: trainingSessions.dayOfWeek,
	timeStart: trainingSessions.timeStart,
	timeEnd: trainingSessions.timeEnd,
	cancelled: trainingSessions.cancelled
};

function sessionStart(s: { date: string; timeStart: string }): Date {
	return new Date(`${s.date}T${s.timeStart}:00`);
}
function sessionEnd(s: { date: string; timeEnd: string }): Date {
	return new Date(`${s.date}T${s.timeEnd}:00`);
}

/** Erstes reguläres, nicht abgesagtes Training nach dem gegebenen Datum. */
export function nextRegularSessionAfter(date: string): SessionRow | null {
	const rows = db
		.select(SESSION_COLS)
		.from(trainingSessions)
		.where(and(gt(trainingSessions.date, date), eq(trainingSessions.isExtra, false)))
		.orderBy(asc(trainingSessions.date), asc(trainingSessions.timeStart))
		.limit(6)
		.all();
	return rows.find((r) => !r.cancelled) ?? null;
}

function loadSession(id: number): SessionRow | null {
	return db.select(SESSION_COLS).from(trainingSessions).where(eq(trainingSessions.id, id)).get() ?? null;
}

/**
 * Laufende Strafe einer Person, sonst null. Fällt das Straf-Training aus,
 * wandert die Strafe still auf das nächste — sonst wäre sie mit einer
 * Absage erledigt.
 */
export function activePenaltyFor(userId: number, now = new Date()): ActivePenalty | null {
	const rows = db
		.select()
		.from(noShowPenalties)
		.where(eq(noShowPenalties.userId, userId))
		.orderBy(asc(noShowPenalties.id))
		.all();
	for (const row of rows.reverse()) {
		let penalty = loadSession(row.penaltySessionId);
		const missed = loadSession(row.missedSessionId);
		if (!penalty || !missed) continue;
		if (penalty.cancelled) {
			const next = nextRegularSessionAfter(penalty.date);
			if (!next) continue;
			db.update(noShowPenalties)
				.set({ penaltySessionId: next.id })
				.where(eq(noShowPenalties.id, row.id))
				.run();
			penalty = next;
		}
		// Eine Stunde nach Trainingsende ist die Runde vorbei.
		if (now.getTime() > sessionEnd(penalty).getTime() + 60 * 60 * 1000) continue;
		const spotFixAt = sessionStart(penalty).getTime() - 2 * 60 * 60 * 1000;
		return {
			id: row.id,
			userId,
			stage: row.stage === 2 ? 2 : 1,
			missed: { id: missed.id, date: missed.date, dayOfWeek: missed.dayOfWeek },
			penalty: {
				id: penalty.id,
				date: penalty.date,
				dayOfWeek: penalty.dayOfWeek,
				timeStart: penalty.timeStart,
				timeEnd: penalty.timeEnd
			},
			phase: now.getTime() < spotFixAt ? 'warning' : 'wrongSpot'
		};
	}
	return null;
}

/** Alle laufenden Strafen zu einem Training — für den Push-Scheduler (falscher Spot ab Stufe 2). */
export function activePenaltiesForSession(sessionId: number, now = new Date()): ActivePenalty[] {
	const userIds = db
		.select({ userId: noShowPenalties.userId })
		.from(noShowPenalties)
		.all()
		.map((r) => r.userId);
	const out: ActivePenalty[] = [];
	for (const uid of new Set(userIds)) {
		const p = activePenaltyFor(uid, now);
		if (p && p.penalty.id === sessionId) out.push(p);
	}
	return out;
}

function prettyDate(ymd: string): string {
	return new Date(`${ymd}T12:00:00`).toLocaleDateString('de-CH', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});
}

/**
 * Legt die Strafe an (falls keine läuft), meldet es der Person per Push
 * und allen im Aktivitäts-Feed. Gibt null zurück, wenn kein Training nach
 * dem verpassten mehr existiert.
 */
export function createNoShowPenalty(params: {
	userId: number;
	missedSessionId: number;
	absenceId?: number | null;
	createdBy?: number | null;
	/** Straf-Training erzwingen (Admin-Nachtrag für ein länger zurückliegendes Training). */
	penaltySessionId?: number | null;
}): { created: boolean; penalty: ActivePenalty | null } {
	const existing = activePenaltyFor(params.userId);
	if (existing) return { created: false, penalty: existing };

	const missed = loadSession(params.missedSessionId);
	if (!missed) return { created: false, penalty: null };
	let target = params.penaltySessionId ? loadSession(params.penaltySessionId) : null;
	if (!target || target.cancelled) target = nextRegularSessionAfter(missed.date);
	// Ist das nächste Training schon vorbei (Nachtrag), zählt das darauf folgende.
	const now = new Date();
	while (target && now.getTime() > sessionEnd(target).getTime()) {
		target = nextRegularSessionAfter(target.date);
	}
	if (!target) return { created: false, penalty: null };

	// Stufe im Wechsel: erste Strafe 1, zweite 2, dritte wieder 1 …
	const previous = db
		.select({ id: noShowPenalties.id })
		.from(noShowPenalties)
		.where(eq(noShowPenalties.userId, params.userId))
		.all().length;
	const stage = previous % 2 === 0 ? 1 : 2;

	db.insert(noShowPenalties)
		.values({
			userId: params.userId,
			missedSessionId: missed.id,
			penaltySessionId: target.id,
			absenceId: params.absenceId ?? null,
			stage,
			createdBy: params.createdBy ?? null
		})
		.run();

	const penalty = activePenaltyFor(params.userId);
	const user = db.select({ username: users.username }).from(users).where(eq(users.id, params.userId)).get();
	const name = user?.username ?? 'Jemand';

	recordEvent({
		kind: 'training.no_show',
		actorUserId: params.userId,
		actorName: name,
		title: `${name} war am ${prettyDate(missed.date)} nicht da — ohne Abmeldung`,
		body: `Strafrunde bis ${prettyDate(target.date)}: Fragezeichen statt Namen. Beim nächsten Mal wird's schlimmer.`,
		url: '/training'
	});
	void sendToUsers([params.userId], {
		title: 'Nicht abgemeldet!',
		body: `Am ${prettyDate(missed.date)} warst du nicht da und hast dich nicht abgemeldet. Bis ${prettyDate(target.date)} siehst du bei „Wer zieht“ nur Fragezeichen. Beim nächsten Mal drohen weitere Konsequenzen.`,
		url: '/training',
		tag: `no-show-${missed.id}-${params.userId}`
	}).catch(() => undefined);

	return { created: true, penalty };
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type WrongSpot = { spotId: number; name: string; city: string };

/**
 * Der falsche Spot: der nächstgelegene andere. Immer derselbe für denselben
 * echten Spot, damit die Anzeige zwischen Seite und Push nicht flackert.
 */
export function wrongSpotFor(realSpotId: number): WrongSpot | null {
	const real = db
		.select({ id: spots.id, latitude: spots.latitude, longitude: spots.longitude })
		.from(spots)
		.where(eq(spots.id, realSpotId))
		.get();
	if (!real || real.latitude == null || real.longitude == null) return null;
	const candidates = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			latitude: spots.latitude,
			longitude: spots.longitude
		})
		.from(spots)
		.where(eq(spots.deleted, false))
		.all()
		.filter((s) => s.id !== real.id && s.latitude != null && s.longitude != null)
		.map((s) => ({
			...s,
			dist: distanceKm(real.latitude!, real.longitude!, s.latitude!, s.longitude!)
		}))
		.filter((s) => s.dist > 0.05) // nicht derselbe Platz unter anderem Namen
		.sort((a, b) => a.dist - b.dist || a.id - b.id);
	const pick = candidates[0];
	return pick ? { spotId: pick.id, name: pick.name, city: pick.city } : null;
}

/**
 * „Wer zieht" für die bestrafte Person: alle anderen werden zu
 * Fragezeichen. Die eigene Zeile bleibt, sonst stimmt die eigene Anzeige
 * (bin ich dabei?) nicht mehr.
 */
export function maskAttending<T extends { id: number; username: string }>(
	list: T[],
	viewerId: number
): T[] {
	let n = 0;
	return list.map((u) => {
		if (u.id === viewerId) return u;
		n += 1;
		return { ...u, id: -n, username: '?', avatar: null } as T;
	});
}
