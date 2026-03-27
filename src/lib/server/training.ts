import { db } from './db';
import { trainingSessions } from './db/schema';
import { gte, asc } from 'drizzle-orm';

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
