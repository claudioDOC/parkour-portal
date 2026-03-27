import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { spots, votes } from '$lib/server/db/schema';
import { eq, and, sql, desc, inArray, or } from 'drizzle-orm';
import { getCurrentWeather } from '$lib/server/weather';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const { city, cities, weatherCondition, isDark, technique, techniques, useAutoWeather } = body;

	let isWet = weatherCondition === 'nass';
	let isDarkFinal = isDark || false;
	let isTrocken = weatherCondition === 'trocken';

	if (useAutoWeather) {
		try {
			const weather = await getCurrentWeather();
			isWet = weather.isWet;
			isDarkFinal = weather.isDark;
			isTrocken = !weather.isWet;
		} catch {}
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

	if (isDarkFinal) {
		conditions.push(sql`${spots.lighting} != 'nein'`);
	}

	if (techList.length > 0) {
		const techOrs = techList.map((t) => sql`${spots.techniques} LIKE ${'%' + t + '%'}`);
		conditions.push(techOrs.length === 1 ? techOrs[0]! : or(...techOrs)!);
	}

	const whereClause = and(...conditions);

	const results = db.select({
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
		.limit(5)
		.all();

	const scored = results.map((spot) => {
		let bonus = 0;
		const weather = (spot.goodWeather || '').split(',').map(w => w.trim());

		if (isWet && weather.includes('nass')) bonus += 1;
		if (isTrocken && weather.includes('trocken')) bonus += 1;
		if (weather.includes('trocken') && weather.includes('nass')) bonus += 0.5;

		if (isDarkFinal && spot.lighting === 'ja') bonus += 2;
		if (isDarkFinal && spot.lighting === 'teilweise') bonus += 1;

		return { ...spot, finalScore: Number(spot.avgScore) + bonus };
	});

	scored.sort((a, b) => b.finalScore - a.finalScore);

	return json({ results: scored.slice(0, 3) });
};
