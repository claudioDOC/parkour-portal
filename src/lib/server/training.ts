import { db } from './db';
import { trainingSessions } from './db/schema';
import { gte, asc, eq } from 'drizzle-orm';

export function isVotingOpenForSession(sessionId: number): boolean {
	const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
	if (!session) return false;
	const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
	const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
	return new Date() < deadline;
}

export function getNextOpenSessionId(): number | null {
	const today = new Date().toISOString().split('T')[0];
	const upcoming = db.select({
		id: trainingSessions.id,
		date: trainingSessions.date,
		timeStart: trainingSessions.timeStart
	})
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(5)
		.all();

	for (const session of upcoming) {
		const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
		const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
		if (new Date() < deadline) {
			return session.id;
		}
	}

	return null;
}
