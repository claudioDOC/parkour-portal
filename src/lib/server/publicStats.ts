import { db } from '$lib/server/db';
import { absences, spots, trainingSessions, users, votes } from '$lib/server/db/schema';
import { asNum } from '$lib/server/asSqlNumber';
import { computeTrainingStats } from '$lib/server/stats';
import { spotsTableHasDeletedColumn } from '$lib/server/spotsTableColumns';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';

export type PublicStatsPayload = {
	generatedAt: string;
	overview: {
		membersActive: number;
		spotsTotal: number;
		spotRatingsTotal: number;
		pastSessions: number;
		upcomingSessions: number;
		totalAbsencesPast: number;
	};
	training: {
		group: ReturnType<typeof computeTrainingStats>['group'];
		monthly: ReturnType<typeof computeTrainingStats>['monthly'];
		leaderboardTop10: ReturnType<typeof computeTrainingStats>['leaderboard'];
	};
	topSpots: {
		id: number;
		name: string;
		city: string;
		avgScore: number;
		voteCount: number;
	}[];
};

export function getPublicStats(): PublicStatsPayload {
	const today = new Date().toISOString().split('T')[0];
	const training = computeTrainingStats();

	const membersActive = db
		.select({ c: sql<number>`COUNT(*)` })
		.from(users)
		.where(and(usersNotDeletedCondition(), eq(users.active, true)))
		.get();

	const spotsCountSel = db.select({ c: sql<number>`COUNT(*)` }).from(spots);
	const spotsTotal = spotsTableHasDeletedColumn()
		? spotsCountSel.where(eq(spots.deleted, false)).get()
		: spotsCountSel.get();

	const spotRatingsTotal = db.select({ c: sql<number>`COUNT(*)` }).from(votes).get();
	const pastSessions = db
		.select({ c: sql<number>`COUNT(*)` })
		.from(trainingSessions)
		.where(lt(trainingSessions.date, today))
		.get();
	const upcomingSessions = db
		.select({ c: sql<number>`COUNT(*)` })
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.get();

	const totalAbsencesPast = db
		.select({ c: sql<number>`COUNT(*)` })
		.from(absences)
		.innerJoin(trainingSessions, eq(absences.sessionId, trainingSessions.id))
		.where(lt(trainingSessions.date, today))
		.get();

	const topSpotsSel = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
			voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
		})
		.from(spots)
		.leftJoin(votes, eq(spots.id, votes.spotId))
		.groupBy(spots.id)
		.orderBy(desc(sql`avg_score`))
		.limit(15);

	const topSpots = (spotsTableHasDeletedColumn()
		? topSpotsSel.where(eq(spots.deleted, false)).all()
		: topSpotsSel.all()
	).map((s) => ({
		id: s.id,
		name: s.name,
		city: s.city,
		avgScore: asNum(s.avgScore),
		voteCount: asNum(s.voteCount)
	}));

	return {
		generatedAt: new Date().toISOString(),
		overview: {
			membersActive: asNum(membersActive?.c ?? 0),
			spotsTotal: asNum(spotsTotal?.c ?? 0),
			spotRatingsTotal: asNum(spotRatingsTotal?.c ?? 0),
			pastSessions: asNum(pastSessions?.c ?? 0),
			upcomingSessions: asNum(upcomingSessions?.c ?? 0),
			totalAbsencesPast: asNum(totalAbsencesPast?.c ?? 0)
		},
		training: {
			group: training.group,
			monthly: training.monthly,
			leaderboardTop10: training.leaderboard.slice(0, 10)
		},
		topSpots
	};
}
