import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { spots, TECHNIQUES } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getNextOpenSessionId, isVotingOpenForSession } from '$lib/server/training';

export const load: PageServerLoad = async ({ url }) => {
	const allSpots = db.select({ city: spots.city }).from(spots).where(eq(spots.deleted, false)).all();
	const cities = [...new Set(allSpots.map((s) => s.city))].sort();

	const rawSession = url.searchParams.get('session');
	const parsedSession = rawSession ? parseInt(rawSession, 10) : NaN;
	const voteSessionId =
		Number.isFinite(parsedSession) && parsedSession > 0 && isVotingOpenForSession(parsedSession)
			? parsedSession
			: getNextOpenSessionId();

	return {
		cities,
		techniques: [...TECHNIQUES],
		voteSessionId,
		nextOpenSessionId: voteSessionId
	};
};
