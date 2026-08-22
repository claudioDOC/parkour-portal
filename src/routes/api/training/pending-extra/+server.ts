import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, asc, eq, gte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { absences, trainingSessionRsvp, trainingSessions, users } from '$lib/server/db/schema';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { isTrainingAttendanceSchemaReady } from '$lib/server/trainingSchemaReady';

/**
 * Nächstes Zusatztraining, zu dem der User weder zu- noch abgesagt hat.
 *
 * Beim Zusatztraining zählt nur die ausdrückliche Antwort — wer nichts sagt,
 * ist weder dabei noch abgemeldet, sondern schlicht offen. Damit das niemand
 * verpasst, fragt die App beim Start danach (wie beim Trip).
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isTrainingAttendanceSchemaReady()) return json({ session: null });

	const today = todayYmdInAppTZ();
	let sessions;
	try {
		sessions = db
			.select()
			.from(trainingSessions)
			.where(
				and(
					eq(trainingSessions.isExtra, true),
					eq(trainingSessions.cancelled, false),
					gte(trainingSessions.date, today)
				)
			)
			.orderBy(asc(trainingSessions.date), asc(trainingSessions.timeStart))
			.all();
	} catch {
		return json({ session: null }); // Migration ausstehend
	}

	for (const session of sessions) {
		const rsvp = db
			.select({ id: trainingSessionRsvp.id })
			.from(trainingSessionRsvp)
			.where(
				and(
					eq(trainingSessionRsvp.sessionId, session.id),
					eq(trainingSessionRsvp.userId, locals.user.id)
				)
			)
			.get();
		if (rsvp) continue;
		const absent = db
			.select({ id: absences.id })
			.from(absences)
			.where(and(eq(absences.sessionId, session.id), eq(absences.userId, locals.user.id)))
			.get();
		if (absent) continue;

		const creator = session.createdBy
			? db
					.select({ username: users.username })
					.from(users)
					.where(eq(users.id, session.createdBy))
					.get()
			: null;
		const inCount = db
			.select({ userId: trainingSessionRsvp.userId })
			.from(trainingSessionRsvp)
			.where(eq(trainingSessionRsvp.sessionId, session.id))
			.all().length;
		const outCount = db
			.select({ userId: absences.userId })
			.from(absences)
			.where(eq(absences.sessionId, session.id))
			.all().length;

		return json({
			session: {
				id: session.id,
				date: session.date,
				dayOfWeek: session.dayOfWeek,
				timeStart: session.timeStart,
				timeEnd: session.timeEnd,
				note: session.note,
				createdByName: creator?.username ?? null,
				inCount,
				outCount
			}
		});
	}

	return json({ session: null });
};
