import { db } from '$lib/server/db';
import { trainingSessions } from '$lib/server/db/schema';
import { gte, sql } from 'drizzle-orm';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

const APP_CALENDAR_TZ = 'Europe/Zurich';
/** Mindestens so viele Zeilen mit `date >= heute` — sonst werden Dienstag/Donnerstag-Termine nachgelegt. */
const MIN_UPCOMING_SESSIONS = 12;

function addCalendarDaysIso(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + days));
	return t.toISOString().slice(0, 10);
}

function zurichWeekdayShort(ymd: string): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const instant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: APP_CALENDAR_TZ,
		weekday: 'short'
	}).formatToParts(instant);
	return parts.find((p) => p.type === 'weekday')?.value ?? '';
}

/**
 * Stellt sicher, dass genügend kommende Trainingstermine in der DB stehen
 * (Dienstag & Donnerstag, Ortszeit Zürich). Idempotent.
 */
export function ensureUpcomingTrainingSessions(): void {
	const today = todayYmdInAppTZ();

	const countRow = db
		.select({ c: sql<number>`count(*)`.as('c') })
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.get();
	let futureCount = Number(countRow?.c ?? 0);
	if (futureCount >= MIN_UPCOMING_SESSIONS) return;

	const existingDates = new Set(
		db
			.select({ date: trainingSessions.date })
			.from(trainingSessions)
			.all()
			.map((r) => r.date)
	);

	for (let offset = 0; offset < 400 && futureCount < MIN_UPCOMING_SESSIONS; offset++) {
		const ymd = addCalendarDaysIso(today, offset);
		if (ymd < today) continue;

		const wd = zurichWeekdayShort(ymd);
		if (wd !== 'Tue' && wd !== 'Thu') continue;
		if (existingDates.has(ymd)) continue;

		const dayOfWeek = wd === 'Tue' ? 'Dienstag' : 'Donnerstag';
		db
			.insert(trainingSessions)
			.values({
				date: ymd,
				dayOfWeek,
				timeStart: '18:15',
				timeEnd: '20:15'
			})
			.run();
		existingDates.add(ymd);
		futureCount++;
	}
}
