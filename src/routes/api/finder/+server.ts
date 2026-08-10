import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spots, votes, trainingSessions, trainingSpotVotes } from '$lib/server/db/schema';
import { eq, and, sql, desc, inArray, or, gte, asc } from 'drizzle-orm';
import { getTrainingWindowForecast } from '$lib/server/trainingForecast';
import { asNum } from '$lib/server/asSqlNumber';
import { CITY_REGIONS } from '$lib/cityRegions';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';

const THUN_WEIGHT_BONUS = 1.45;

const thunCityLower = new Set(
	(CITY_REGIONS.find((r) => r.id === 'thun')?.cities ?? []).map((c) => c.trim().toLowerCase())
);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const { city, cities, weatherCondition, isDark, technique, techniques, useAutoWeather } = body;

	let isWet = weatherCondition === 'nass';
	let isTrocken = weatherCondition === 'trocken';
	let lightingHardSql = Boolean(isDark);

	let fc: Awaited<ReturnType<typeof getTrainingWindowForecast>> | null = null;

	if (useAutoWeather) {
		try {
			const today = todayYmdInAppTZ();
			const nextSession = db
				.select()
				.from(trainingSessions)
				.where(gte(trainingSessions.date, today))
				.orderBy(asc(trainingSessions.date))
				.limit(1)
				.get();

			fc = await getTrainingWindowForecast(
				nextSession
					? {
							date: nextSession.date,
							timeStart: nextSession.timeStart,
							timeEnd: nextSession.timeEnd
						}
					: { date: today, timeStart: '18:15', timeEnd: '20:15' }
			);
			isWet = fc.isWet;
			isTrocken = !fc.isWet;
			lightingHardSql = fc.applyLightingHardFilter;
		} catch {
			// Fallback: manuelle Logik aus Body
		}
	}

	const cityList: string[] = Array.isArray(cities)
		? cities.filter((c: unknown) => typeof c === 'string' && c.length > 0)
		: city && city !== 'egal'
			? [city]
			: [];

	const techList: string[] = Array.isArray(techniques)
		? techniques.filter((t: unknown) => typeof t === 'string' && t.length > 0)
		: technique && technique !== 'egal'
			? [technique]
			: [];

	const conditions = [eq(spots.deleted, false)];

	if (cityList.length > 0) {
		conditions.push(inArray(spots.city, cityList));
	}

	if (isWet) {
		conditions.push(sql`${spots.goodWeather} LIKE '%nass%'`);
	} else if (isTrocken) {
		conditions.push(sql`${spots.goodWeather} LIKE '%trocken%'`);
	}

	if (lightingHardSql) {
		conditions.push(sql`${spots.lighting} != 'nein'`);
	}

	if (techList.length > 0) {
		const techOrs = techList.map((t) => sql`${spots.techniques} LIKE ${'%' + t + '%'}`);
		conditions.push(techOrs.length === 1 ? techOrs[0]! : or(...techOrs)!);
	}

	const whereClause = and(...conditions);

	const results = db
		.select({
			id: spots.id,
			name: spots.name,
			city: spots.city,
			lighting: spots.lighting,
			techniques: spots.techniques,
			goodWeather: spots.goodWeather,
			description: spots.description,
			avgScore: sql<number>`COALESCE(AVG(${votes.score}), 0)`.as('avg_score'),
			voteCount: sql<number>`COUNT(${votes.id})`.as('vote_count')
		})
		.from(spots)
		.leftJoin(votes, eq(spots.id, votes.spotId))
		.where(whereClause)
		.groupBy(spots.id)
		.orderBy(desc(sql`avg_score`))
		.all();

	/**
	 * Abwechslung: Wo zuletzt trainiert wurde (Voting-Sieger der letzten
	 * Sessions), gibt es einen abklingenden Malus — sonst gewinnt ewig
	 * derselbe Top-Spot.
	 */
	const recentWinnerRank = new Map<number, number>();
	{
		const today = todayYmdInAppTZ();
		const recent = db
			.select({
				sessionId: trainingSpotVotes.sessionId,
				spotId: trainingSpotVotes.spotId,
				date: trainingSessions.date,
				c: sql<number>`COUNT(*)`.as('c')
			})
			.from(trainingSpotVotes)
			.innerJoin(trainingSessions, eq(trainingSessions.id, trainingSpotVotes.sessionId))
			.where(sql`${trainingSessions.date} < ${today}`)
			.groupBy(trainingSpotVotes.sessionId, trainingSpotVotes.spotId)
			.orderBy(desc(trainingSessions.date), desc(sql`c`))
			.limit(60)
			.all();
		const winnerBySession = new Map<number, { spotId: number; date: string }>();
		for (const r of recent) {
			if (!winnerBySession.has(r.sessionId)) {
				winnerBySession.set(r.sessionId, { spotId: r.spotId, date: r.date });
			}
		}
		const winners = [...winnerBySession.values()].sort((a, b) => b.date.localeCompare(a.date));
		winners.slice(0, 6).forEach((w, i) => {
			if (!recentWinnerRank.has(w.spotId)) recentWinnerRank.set(w.spotId, i);
		});
	}

	/** Tages-Jitter: bei ähnlichen Scores rotiert die Empfehlung täglich. */
	const daySeed = todayYmdInAppTZ();
	function dailyJitter(spotId: number): number {
		let h = 0;
		const s = `${daySeed}:${spotId}`;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		return ((h % 1000) / 1000) * 0.5; // 0 … 0.5
	}

	const scored = results.map((spot) => {
		let weatherBonus = 0;
		const weatherTags = (spot.goodWeather || '').split(',').map((w) => w.trim());

		if (isWet && weatherTags.includes('nass')) weatherBonus += 1.15;
		if (isTrocken && weatherTags.includes('trocken')) weatherBonus += 1.15;
		if (weatherTags.includes('trocken') && weatherTags.includes('nass')) weatherBonus += 0.55;

		let lightingBonus = 0;
		if (useAutoWeather && fc) {
			if (fc.lightCategory === 'dunkel') {
				if (spot.lighting === 'ja') lightingBonus += 2;
				else if (spot.lighting === 'teilweise') lightingBonus += 1;
			} else if (fc.lightCategory === 'misch') {
				if (spot.lighting === 'ja') lightingBonus += 1.35;
				else if (spot.lighting === 'teilweise') lightingBonus += 0.7;
			}
		} else if (lightingHardSql) {
			if (spot.lighting === 'ja') lightingBonus += 2;
			else if (spot.lighting === 'teilweise') lightingBonus += 1;
		}

		const regionBonus = thunCityLower.has(spot.city.trim().toLowerCase()) ? THUN_WEIGHT_BONUS : 0;

		const avg = asNum(spot.avgScore);
		const voteCount = asNum(spot.voteCount);

		// Kürzlich dran gewesen → abklingender Malus (letztes Training am stärksten).
		const rank = recentWinnerRank.get(spot.id);
		const varietyMalus = rank !== undefined ? 1.6 * Math.pow(0.6, rank) : 0;

		const finalScore =
			avg * 1.12 + weatherBonus + lightingBonus + regionBonus - varietyMalus + dailyJitter(spot.id);

		return { ...spot, avgScore: avg, voteCount, finalScore, recentlyUsed: rank !== undefined };
	});

	scored.sort((a, b) => b.finalScore - a.finalScore);

	return json({ results: scored.slice(0, 3), forecastHint: fc?.summaryLine ?? null });
};
