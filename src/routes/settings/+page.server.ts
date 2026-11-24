import type { PageServerLoad } from './$types';
import { calendarUrlFor } from '$lib/server/calendarFeed';

/** Persönlicher Kalender-Abo-Link (siehe calendarFeed.ts). */
export const load: PageServerLoad = async ({ locals }) => {
	const calendarUrl = locals.user ? calendarUrlFor(locals.user.id, process.env.ORIGIN ?? '') : null;
	return { calendarUrl };
};
