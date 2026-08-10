import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { spotChallengeCompletions, spotChallenges, spots } from '$lib/server/db/schema';
import { computeTrainingStats } from '$lib/server/stats';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';

/** Persönliche Seite: meine Kennzahlen, Monatsverlauf, geschaffte Challenges. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const uid = locals.user.id;

	const stats = computeTrainingStats();
	const me = stats.leaderboard.find((r) => r.userId === uid) ?? null;
	const myRank = me ? stats.leaderboard.findIndex((r) => r.userId === uid) + 1 : null;

	// Monatsverlauf: meine Quote pro Monat (letzte 12 Monate mit Daten)
	const monthly = stats.monthDetail
		.map((m) => {
			const row = m.leaderboard.find((r) => r.userId === uid);
			return row
				? {
						key: m.key,
						trainings: row.eligiblePastSessions,
						pulled: row.implicitPresent,
						percent: row.showUpPercent
					}
				: null;
		})
		.filter((m): m is NonNullable<typeof m> => m !== null)
		.slice(-12);

	// Geschaffte Challenges (neueste zuerst)
	let completedChallenges: {
		id: number;
		title: string;
		spotId: number;
		spotName: string;
		completedAt: string;
	}[] = [];
	let openChallengeCount = 0;
	if (isSpotChallengesSchemaReady()) {
		completedChallenges = db
			.select({
				id: spotChallenges.id,
				title: spotChallenges.title,
				spotId: spotChallenges.spotId,
				spotName: spots.name,
				completedAt: spotChallengeCompletions.createdAt
			})
			.from(spotChallengeCompletions)
			.innerJoin(spotChallenges, eq(spotChallenges.id, spotChallengeCompletions.challengeId))
			.innerJoin(spots, eq(spots.id, spotChallenges.spotId))
			.where(eq(spotChallengeCompletions.userId, uid))
			.orderBy(desc(spotChallengeCompletions.createdAt))
			.limit(20)
			.all();

		const totalActive =
			db
				.select({ c: sql<number>`COUNT(*)` })
				.from(spotChallenges)
				.where(eq(spotChallenges.deleted, false))
				.get()?.c ?? 0;
		openChallengeCount = Math.max(0, Number(totalActive) - completedChallenges.length);
	}

	return {
		me,
		myRank,
		totalMembers: stats.leaderboard.length,
		monthly,
		completedChallenges,
		openChallengeCount
	};
};
