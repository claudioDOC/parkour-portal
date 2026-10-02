import { db } from './db';
import { trainingSessions } from './db/schema';
import { gte, asc, eq } from 'drizzle-orm';

/**
 * Spot-Voting-Schluss. Beim festen Termin zwei Stunden vor Beginn — so steht
 * der Spot rechtzeitig und der „Spot fix"-Push kann raus. Beim Zusatztraining
 * aber gilt der Beginn selbst: Es wird oft spontan am selben Tag eingetragen,
 * teils innerhalb dieser zwei Stunden — mit der festen Frist wäre das Voting
 * dann von Anfang an zu und es gäbe nie einen Spot.
 */
export function votingDeadlineFor(session: {
	date: string;
	timeStart: string;
	isExtra?: boolean | number | null;
}): Date {
	const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
	if (session.isExtra) return trainingStart;
	return new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
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
