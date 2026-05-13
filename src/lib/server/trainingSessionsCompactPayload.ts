import { db } from '$lib/server/db';
import { trainingSessions } from '$lib/server/db/schema';
import { asc, gte } from 'drizzle-orm';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { ensureUpcomingTrainingSessions } from '$lib/server/ensureUpcomingTrainingSessions';

export function buildTrainingSessionsCompactPayload() {
	ensureUpcomingTrainingSessions();
	const today = todayYmdInAppTZ();
	const sessions = db
		.select()
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(24)
		.all();

	return { sessions };
}
