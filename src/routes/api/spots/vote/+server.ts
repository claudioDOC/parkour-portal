import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { votes, spots } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { spotId, score } = await request.json();

	if (!spotId || !score || score < 1 || score > 5) {
		return json({ error: 'Spot-ID und Score (1-5) erforderlich' }, { status: 400 });
	}

	const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
	if (!spot) {
		return json({ error: 'Spot nicht gefunden' }, { status: 404 });
	}

	const existing = db.select().from(votes)
		.where(and(eq(votes.userId, locals.user.id), eq(votes.spotId, spotId)))
		.get();

	if (existing) {
		db.update(votes)
			.set({ score })
			.where(eq(votes.id, existing.id))
			.run();
	} else {
		db.insert(votes).values({
			userId: locals.user.id,
			spotId,
			score
		}).run();
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { spotId } = await request.json();

	if (!spotId) {
		return json({ error: 'Spot-ID erforderlich' }, { status: 400 });
	}

	db.delete(votes)
		.where(and(eq(votes.userId, locals.user.id), eq(votes.spotId, spotId)))
		.run();

	return json({ success: true });
};
