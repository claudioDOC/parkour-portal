import type { PageServerLoad } from './$types';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { soloTrainings, users } from '$lib/server/db/schema';
import { computeTrainingStats } from '$lib/server/stats';
import { computeExtraTrainingStats } from '$lib/server/extraStats';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

export const load: PageServerLoad = async ({ locals }) => {
	// Solo-Trainings: bewusst getrennt von der Anwesenheits-Statistik.
	let solo: {
		leaderboard: { userId: number; username: string; total: number; last90: number }[];
		recent: { username: string; date: string; note: string | null }[];
	} = { leaderboard: [], recent: [] };
	try {
		const today = todayYmdInAppTZ();
		const cutoff90 = new Date(Date.parse(today) - 90 * 86_400_000).toISOString().slice(0, 10);
		const rows = db
			.select({
				userId: soloTrainings.userId,
				username: users.username,
				date: soloTrainings.date,
				note: soloTrainings.note
			})
			.from(soloTrainings)
			.innerJoin(users, eq(users.id, soloTrainings.userId))
			.where(usersNotDeletedCondition())
			.orderBy(desc(soloTrainings.date))
			.all();

		const byUser = new Map<number, { userId: number; username: string; total: number; last90: number }>();
		for (const r of rows) {
			const e = byUser.get(r.userId) ?? { userId: r.userId, username: r.username, total: 0, last90: 0 };
			e.total++;
			if (r.date >= cutoff90) e.last90++;
			byUser.set(r.userId, e);
		}
		solo = {
			leaderboard: [...byUser.values()].sort(
				(a, b) => b.last90 - a.last90 || b.total - a.total || a.username.localeCompare(b.username, 'de')
			),
			recent: rows.slice(0, 8).map((r) => ({ username: r.username, date: r.date, note: r.note }))
		};
	} catch {
		/* Tabelle fehlt (Migration ausstehend) — Sektion bleibt leer. */
	}

	return {
		user: locals.user,
		stats: computeTrainingStats(),
		solo,
		extra: computeExtraTrainingStats()
	};
};
