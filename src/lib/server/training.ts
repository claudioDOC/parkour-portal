import { db } from './db';
import { trainingSessions } from './db/schema';
import { gte, asc, eq } from 'drizzle-orm';

/**
 * Späteste Uhrzeit, zu der der Spot feststeht — abgeleitet vom Normaltermin
 * 18:15 minus zwei Stunden.
 */
export const SPOT_FIX_LATEST = '16:15';

/**
 * Spot-Voting-Schluss beim festen Termin: der FRÜHERE von „zwei Stunden vor
 * Beginn" und 16:15.
 *
 * Wird das Training nach hinten verschoben (19:00 statt 18:15), soll der Spot
 * trotzdem um 16:15 stehen — sonst verschiebt sich mit der Zeit auch die
 * Planung, und wer früher Schluss macht, weiss bis 17:00 nicht, wohin.
 * Beginnt es früher als 18:15, gilt weiterhin Beginn minus zwei Stunden.
 *
 * Beim Zusatztraining gilt der Beginn selbst: Es wird oft spontan am selben
 * Tag eingetragen, teils innerhalb dieser zwei Stunden — mit einer festen
 * Frist wäre das Voting von Anfang an zu und es gäbe nie einen Spot.
 */
export function votingDeadlineFor(session: {
	date: string;
	timeStart: string;
	isExtra?: boolean | number | null;
}): Date {
	const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
	if (session.isExtra) return trainingStart;
	const twoHoursBefore = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
	const standard = new Date(`${session.date}T${SPOT_FIX_LATEST}:00`);
	return twoHoursBefore < standard ? twoHoursBefore : standard;
}

/**
 * Ist das Training vorbei? Entscheidet, ob eine Änderung noch jemanden
 * betrifft: Bei einem durchgeführten Training ist der nachträglich gesetzte
 * Spot reine Statistik-Korrektur — darüber will niemand mehr eine
 * Benachrichtigung bekommen.
 */
export function isSessionOver(
	session: { date: string; timeEnd: string },
	now = new Date()
): boolean {
	return now > new Date(`${session.date}T${session.timeEnd}:00`);
}

export function isVotingOpenForSession(sessionId: number): boolean {
	const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
	if (!session) return false;
	return new Date() < votingDeadlineFor(session);
}

export function getNextOpenSessionId(): number | null {
	const today = new Date().toISOString().split('T')[0];
	const upcoming = db.select({
		id: trainingSessions.id,
		date: trainingSessions.date,
		timeStart: trainingSessions.timeStart,
		isExtra: trainingSessions.isExtra
	})
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(5)
		.all();

	for (const session of upcoming) {
		if (new Date() < votingDeadlineFor(session)) {
			return session.id;
		}
	}

	return null;
}
