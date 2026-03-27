import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { spots, TECHNIQUES } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getNextOpenSessionId } from '$lib/server/training';

export const load: PageServerLoad = async () => {
	const allSpots = db.select({ city: spots.city }).from(spots).where(eq(spots.deleted, false)).all();
	const cities = [...new Set(allSpots.map((s) => s.city))].sort();

	return {
		cities,
		techniques: [...TECHNIQUES],
		nextOpenSessionId: getNextOpenSessionId()
	};
};
