import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { spotChallenges, spotChallengeCompletions, spots, users } from '$lib/server/db/schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { andWithUsersNotDeleted } from '$lib/server/usersWhere';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';
import { asNum } from '$lib/server/asSqlNumber';

export const load: PageServerLoad = async ({ locals }) => {
	const viewerUsername = locals.user?.username ?? null;

	if (!isSpotChallengesSchemaReady()) {
		return {
			schemaReady: false as const,
			spotsWithChallenges: [] as [],
			totalChallenges: 0,
			totalClears: 0,
			openQuests: 0,
			leaderboard: [] as { userId: number; username: string; clears: number }[],
			recentClears: [] as {
				username: string;
				challengeTitle: string;
				spotName: string;
				spotId: number;
				at: string;
			}[],
			viewerUsername
		};
	}

	const rows = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			description: spotChallenges.description,
			spotId: spotChallenges.spotId,
			spotName: spots.name,
			spotCity: spots.city,
			isMicro: spots.isMicro,
			createdAt: spotChallenges.createdAt,
			createdByName: users.username
		})
		.from(spotChallenges)
		.innerJoin(spots, eq(spotChallenges.spotId, spots.id))
		.innerJoin(users, andWithUsersNotDeleted(eq(spotChallenges.createdBy, users.id)))
		.where(and(eq(spotChallenges.deleted, false), eq(spots.deleted, false)))
		.orderBy(asc(spots.name), asc(spotChallenges.title))
		.all();

	const challengeIds = rows.map((r) => r.id);

	const completersByChallenge = new Map<number, { username: string; completedAt: string }[]>();
	let totalClears = 0;

	if (challengeIds.length > 0) {
		const completions = db
			.select({
				challengeId: spotChallengeCompletions.challengeId,
				username: users.username,
				completedAt: spotChallengeCompletions.createdAt
			})
			.from(spotChallengeCompletions)
			.innerJoin(users, andWithUsersNotDeleted(eq(spotChallengeCompletions.userId, users.id)))
			.where(inArray(spotChallengeCompletions.challengeId, challengeIds))
			.orderBy(asc(spotChallengeCompletions.challengeId), asc(users.username), asc(spotChallengeCompletions.createdAt))
			.all();

		totalClears = completions.length;
		for (const c of completions) {
			const list = completersByChallenge.get(c.challengeId) ?? [];
			list.push({ username: c.username, completedAt: c.completedAt });
			completersByChallenge.set(c.challengeId, list);
		}
	}

	const rowsWithCompleters = rows.map((r) => ({
		...r,
		completers: completersByChallenge.get(r.id) ?? []
	}));

	const bySpot = new Map<
		number,
		{
			spotId: number;
			spotName: string;
			spotCity: string;
			isMicro: boolean;
			challenges: typeof rowsWithCompleters;
		}
	>();
	for (const r of rowsWithCompleters) {
		let g = bySpot.get(r.spotId);
		if (!g) {
			g = {
				spotId: r.spotId,
				spotName: r.spotName,
				spotCity: r.spotCity,
				isMicro: r.isMicro,
				challenges: []
			};
			bySpot.set(r.spotId, g);
		}
		g.challenges.push(r);
	}

	const spotsWithChallenges = [...bySpot.values()].sort((a, b) =>
		a.spotName.localeCompare(b.spotName, 'de', { sensitivity: 'base' })
	);

	const openQuests = rowsWithCompleters.filter((r) => r.completers.length === 0).length;

	const leaderboardRaw = db
		.select({
			userId: spotChallengeCompletions.userId,
			username: users.username,
			c: sql<number>`count(*)`.as('c')
		})
		.from(spotChallengeCompletions)
		.innerJoin(users, andWithUsersNotDeleted(eq(spotChallengeCompletions.userId, users.id)))
		.innerJoin(spotChallenges, eq(spotChallengeCompletions.challengeId, spotChallenges.id))
		.innerJoin(spots, eq(spotChallenges.spotId, spots.id))
		.where(and(eq(spotChallenges.deleted, false), eq(spots.deleted, false)))
		.groupBy(spotChallengeCompletions.userId, users.username)
		.all();

	const leaderboard = leaderboardRaw
		.map((row) => ({
			userId: asNum(row.userId),
			username: row.username,
			clears: asNum(row.c)
		}))
		.sort((a, b) => b.clears - a.clears || a.username.localeCompare(b.username, 'de'))
		.slice(0, 15);

	const recentClears = db
		.select({
			username: users.username,
			challengeTitle: spotChallenges.title,
			spotName: spots.name,
			spotId: spots.id,
			at: spotChallengeCompletions.createdAt
		})
		.from(spotChallengeCompletions)
		.innerJoin(users, andWithUsersNotDeleted(eq(spotChallengeCompletions.userId, users.id)))
		.innerJoin(spotChallenges, eq(spotChallengeCompletions.challengeId, spotChallenges.id))
		.innerJoin(spots, eq(spotChallenges.spotId, spots.id))
		.where(and(eq(spotChallenges.deleted, false), eq(spots.deleted, false)))
		.orderBy(desc(spotChallengeCompletions.createdAt))
		.limit(18)
		.all();

	return {
		schemaReady: true as const,
		spotsWithChallenges,
		totalChallenges: rows.length,
		totalClears,
		openQuests,
		leaderboard,
		recentClears,
		viewerUsername
	};
};
