import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { votes, spots } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { logAudit } from '$lib/server/audit';

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
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

	logAudit({
		event,
		action: existing ? 'spot.vote.update' : 'spot.vote.create',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { spotId, spotName: spot.name, score }
	});

	return json({ success: true });
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { spotId } = await request.json();

	if (!spotId) {
		return json({ error: 'Spot-ID erforderlich' }, { status: 400 });
	}

	const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
	db.delete(votes)
		.where(and(eq(votes.userId, locals.user.id), eq(votes.spotId, spotId)))
		.run();

	logAudit({
		event,
		action: 'spot.vote.remove',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { spotId, spotName: spot?.name }
	});

	return json({ success: true });
};
