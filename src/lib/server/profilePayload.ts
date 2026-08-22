import { desc, eq, lt, sql } from 'drizzle-orm';
import { db } from './db';
import {
	soloTrainings,
	spotChallengeCompletions,
	spotChallenges,
	spots,
	trainingSessionRsvp,
	trainingSessions,
	users
} from './db/schema';
import { computeTrainingStats } from './stats';
import { isSpotChallengesSchemaReady } from './spotChallengesSchemaReady';
import { usersNotDeletedCondition } from './usersWhere';
import { avatarFullUrl } from './avatar';
import { todayYmdInAppTZ } from './calendarToday';
import { and } from 'drizzle-orm';

export type ProfilePayload = NonNullable<ReturnType<typeof buildProfilePayload>>;

/** Profil eines Users — von jedem Mitglied einsehbar. null = User existiert nicht. */
export function buildProfilePayload(userId: number) {
	const target = db
		.select({ id: users.id, username: users.username, avatar: users.avatar })
		.from(users)
		.where(and(eq(users.id, userId), usersNotDeletedCondition()))
		.get();
	if (!target) return null;

	const stats = computeTrainingStats();
	const me = stats.leaderboard.find((r) => r.userId === userId) ?? null;
	const rank = me ? stats.leaderboard.findIndex((r) => r.userId === userId) + 1 : null;

	const monthly = stats.monthDetail
		.map((m) => {
			const row = m.leaderboard.find((r) => r.userId === userId);
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
			.where(eq(spotChallengeCompletions.userId, userId))
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

	// Solo-Trainings (separate Statistik)
	let soloCount = 0;
	try {
		soloCount =
			db
				.select({ c: sql<number>`COUNT(*)` })
				.from(soloTrainings)
				.where(eq(soloTrainings.userId, userId))
				.get()?.c ?? 0;
		soloCount = Number(soloCount);
	} catch {
		/* Tabelle fehlt — 0 reicht */
	}

	// Zusatztrainings: nur vergangene, nicht abgesagte, mit ausdrücklicher Zusage.
	let extraCount = 0;
	try {
		extraCount = Number(
			db
				.select({ c: sql<number>`COUNT(*)` })
				.from(trainingSessionRsvp)
				.innerJoin(trainingSessions, eq(trainingSessions.id, trainingSessionRsvp.sessionId))
				.where(
					and(
						eq(trainingSessionRsvp.userId, userId),
						eq(trainingSessions.isExtra, true),
						eq(trainingSessions.cancelled, false),
						lt(trainingSessions.date, todayYmdInAppTZ())
					)
				)
				.get()?.c ?? 0
		);
	} catch {
		/* Migration ausstehend — 0 reicht */
	}

	// Alle Mitglieder für die Übersicht unten auf der Profilseite.
	const members = db
		.select({ id: users.id, username: users.username, avatar: users.avatar, active: users.active })
		.from(users)
		.where(usersNotDeletedCondition())
		.all()
		.filter((u) => u.active !== false)
		.map((u) => ({
			id: u.id,
			username: u.username,
			avatar: u.avatar ? `/uploads/${u.avatar}` : null
		}))
		.sort((a, b) => a.username.localeCompare(b.username, 'de'));

	return {
		profile: {
			id: target.id,
			username: target.username,
			avatar: target.avatar ? `/uploads/${target.avatar}` : null,
			avatarFull: avatarFullUrl(target.avatar)
		},
		me,
		myRank: rank,
		totalMembers: stats.leaderboard.length,
		monthly,
		completedChallenges,
		openChallengeCount,
		soloCount,
		extraCount,
		members
	};
}
