import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { trainingSessions, trainingSpotVotes, spots } from '$lib/server/db/schema';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { asNum } from '$lib/server/asSqlNumber';
import { getCurrentWeather } from '$lib/server/weather';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const today = todayYmdInAppTZ();
	const session = db
		.select()
		.from(trainingSessions)
		.where(gte(trainingSessions.date, today))
		.orderBy(asc(trainingSessions.date))
		.limit(1)
		.get();

	if (!session) return json({ session: null });

	const spotVotes = db
		.select({
			spotId: trainingSpotVotes.spotId,
			spotName: spots.name,
			voteCount: sql<number>`COUNT(${trainingSpotVotes.id})`.as('vote_count')
		})
		.from(trainingSpotVotes)
		.innerJoin(spots, eq(trainingSpotVotes.spotId, spots.id))
		.where(eq(trainingSpotVotes.sessionId, session.id))
		.groupBy(trainingSpotVotes.spotId)
		.orderBy(sql`vote_count DESC`)
		.all()
		.map((v) => ({ ...v, voteCount: asNum(v.voteCount) }));

	const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
	const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
	const votingClosed = new Date() > deadline;

	let effectiveSpotName: string | null = null;
	let effectiveSpotId: number | null = null;
	let effectiveKind: 'winner' | 'auto' | null = null;

	if (votingClosed) {
		if (spotVotes.length > 0) {
			effectiveSpotName = spotVotes[0].spotName;
			effectiveSpotId = spotVotes[0].spotId;
			effectiveKind = 'winner';
		} else {
			try {
				const weather = await getCurrentWeather();
				let query = `SELECT s.id, s.name
					FROM spots s LEFT JOIN votes v ON s.id = v.spot_id
					WHERE (s.city = 'Thun' OR s.city = 'Steffisburg')`;

				if (weather.isDark) query += ` AND s.lighting != 'nein'`;
				if (weather.isWet) query += ` AND s.good_weather LIKE '%nass%'`;
				else query += ` AND s.good_weather LIKE '%trocken%'`;

				query += ` GROUP BY s.id ORDER BY COALESCE(AVG(v.score), 0) DESC LIMIT 1`;
				const result = db.all(sql.raw(query)) as { id: number; name: string }[];
				if (result.length > 0) {
					effectiveSpotName = result[0].name;
					effectiveSpotId = result[0].id;
					effectiveKind = 'auto';
				}
			} catch {
				// Wetterfehler soll Watch-Endpoint nicht brechen.
			}
		}
	}

	return json({
		session: {
			sessionId: session.id,
			date: session.date,
			dayOfWeek: session.dayOfWeek,
			totalVotes: spotVotes.reduce((sum, v) => sum + v.voteCount, 0),
			leaderSpotId: spotVotes[0]?.spotId ?? null,
			leaderSpotName: spotVotes[0]?.spotName ?? null,
			leaderVotes: spotVotes[0]?.voteCount ?? 0,
			votingClosed,
			effectiveSpotId,
			effectiveSpotName,
			effectiveKind
		}
	});
};

