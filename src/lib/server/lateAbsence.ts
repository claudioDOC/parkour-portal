/**
 * Kurzfristige Abmeldung: nach dem Spot-Schluss (siehe votingDeadlineFor —
 * zwei Stunden vor Beginn, spätestens 16:15) und bis zum Trainingsende.
 *
 * Erlaubt bleibt sie — als Notfall, mit dreifacher Bestätigung. Dafür ist
 * der Name danach MARK_DAYS Tage rot markiert. Ziel ist nicht die Strafe,
 * sondern dass man sich abmeldet, solange Spot und Planung noch reagieren
 * können. Ab dem Moment, in dem der Spot steht, ist es zu spät.
 */
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { lateAbsenceMarks } from '$lib/server/db/schema';
import { votingDeadlineFor } from '$lib/server/training';

export const LATE_WINDOW_MIN = 120;
export const LATE_CONFIRMATIONS = 3;
export const MARK_DAYS = 7;

/** Minuten bis Trainingsbeginn (negativ = läuft schon / vorbei). */
export function minutesUntilStart(session: { date: string; timeStart: string }, now = new Date()): number {
	const start = new Date(`${session.date}T${session.timeStart}:00`).getTime();
	return Math.round((start - now.getTime()) / 60000);
}

/**
 * Kurzfristig = der Spot steht schon und das Training ist noch nicht vorbei.
 * Gilt nicht für Zusatztrainings (dort ist das Voting bis zum Beginn offen).
 */
export function isLateAbsence(
	session: { date: string; timeStart: string; timeEnd: string; isExtra?: boolean | number | null },
	now = new Date()
): boolean {
	if (session.isExtra) return false;
	const end = new Date(`${session.date}T${session.timeEnd}:00`);
	return now > votingDeadlineFor(session) && now <= end;
}

export function recordLateAbsence(userId: number, sessionId: number, minutesBefore: number): void {
	db.insert(lateAbsenceMarks)
		.values({
			userId,
			sessionId,
			minutesBefore,
			expiresAt: sql`(datetime('now', '+${sql.raw(String(MARK_DAYS))} days'))`
		})
		.run();
}

/** Wer trägt gerade die rote Markierung? */
export function lateMarkedUserIds(): Set<number> {
	const rows = db
		.select({ userId: lateAbsenceMarks.userId })
		.from(lateAbsenceMarks)
		.where(gt(lateAbsenceMarks.expiresAt, sql`datetime('now')`))
		.all();
	return new Set(rows.map((r) => r.userId));
}

/** Admin-Gnade: Markierung einer Person vorzeitig entfernen. */
export function clearLateMarks(userId: number): number {
	return db
		.delete(lateAbsenceMarks)
		.where(and(eq(lateAbsenceMarks.userId, userId), gt(lateAbsenceMarks.expiresAt, sql`datetime('now')`)))
		.run().changes;
}
