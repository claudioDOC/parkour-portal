import { db } from '$lib/server/db';
import { trainingSessions, trainingSessionRsvp, users } from '$lib/server/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

/**
 * Teilnahmen an Zusatztrainings — bewusst getrennt von der Hall of Fame.
 *
 * Die feste Wertung („Gezogen %") misst Verlässlichkeit bei den REGULÄREN
 * Terminen. Zusatztrainings dort mitzuzählen würde sie verzerren: Sie
 * finden unregelmässig statt, und wer gerade nicht kann, stünde schlechter
 * da, ohne je etwas versäumt zu haben. Darum eine eigene Zählung — und in
 * ihr zählt nur die ausdrückliche Zusage.
 */
export type ExtraStatsRow = {
	userId: number;
	username: string;
	avatar: string | null;
	/** Teilnahmen an vergangenen Zusatztrainings. */
	extraSessions: number;
};

export function computeExtraTrainingStats(): {
	rows: ExtraStatsRow[];
	pastExtraCount: number;
} {
	const today = todayYmdInAppTZ();
	try {
		const past = db
			.select({ id: trainingSessions.id })
			.from(trainingSessions)
			.where(
				and(
					eq(trainingSessions.isExtra, true),
					eq(trainingSessions.cancelled, false),
					lt(trainingSessions.date, today)
				)
			)
			.all();
		const pastIds = new Set(past.map((p) => p.id));

		const rsvps = db
			.select({
				userId: trainingSessionRsvp.userId,
				sessionId: trainingSessionRsvp.sessionId,
				username: users.username,
				avatar: users.avatar
			})
			.from(trainingSessionRsvp)
			.innerJoin(users, eq(users.id, trainingSessionRsvp.userId))
			.where(usersNotDeletedCondition())
			.all();

		const byUser = new Map<number, ExtraStatsRow>();
		for (const r of rsvps) {
			if (!pastIds.has(r.sessionId)) continue;
			const row = byUser.get(r.userId) ?? {
				userId: r.userId,
				username: r.username,
				avatar: r.avatar ? `/uploads/${r.avatar}` : null,
				extraSessions: 0
			};
			row.extraSessions += 1;
			byUser.set(r.userId, row);
		}

		return {
			rows: [...byUser.values()].sort((a, b) => b.extraSessions - a.extraSessions),
			pastExtraCount: pastIds.size
		};
	} catch {
		// Migration noch nicht angewandt — Auswertung bleibt leer.
		return { rows: [], pastExtraCount: 0 };
	}
}
