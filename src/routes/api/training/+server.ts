import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { absences, trainingSessions, trainingSpotVotes, spots } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const { action, sessionId, reason, spotId } = await request.json();

	if (!sessionId) {
		return json({ error: 'Session-ID erforderlich' }, { status: 400 });
	}

	const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
	if (!session) {
		return json({ error: 'Training nicht gefunden' }, { status: 404 });
	}

	if (action === 'absence') {
		if (!reason || reason.trim().length < 10) {
			return json({ error: 'Grund ist erforderlich (mind. 10 Zeichen)' }, { status: 400 });
		}

		const existing = db.select().from(absences)
			.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
			.get();

		if (existing) {
			return json({ error: 'Bereits abgemeldet' }, { status: 400 });
		}

		db.insert(absences).values({
			userId: locals.user.id,
			sessionId,
			reason: reason.trim()
		}).run();

		return json({ success: true });
	}

	if (action === 'cancel_absence') {
		db.delete(absences)
			.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
			.run();

		return json({ success: true });
	}

	if (action === 'vote_spot') {
		if (!spotId) {
			return json({ error: 'Spot-ID erforderlich' }, { status: 400 });
		}

		const spot = db.select().from(spots).where(eq(spots.id, spotId)).get();
		if (!spot) {
			return json({ error: 'Spot nicht gefunden' }, { status: 404 });
		}

		const trainingStart = new Date(`${session.date}T${session.timeStart}:00`);
		const deadline = new Date(trainingStart.getTime() - 2 * 60 * 60 * 1000);
		if (new Date() > deadline) {
			return json({ error: 'Voting ist geschlossen (2h vor Training)' }, { status: 400 });
		}

		const existing = db.select().from(trainingSpotVotes)
			.where(and(
				eq(trainingSpotVotes.userId, locals.user.id),
				eq(trainingSpotVotes.sessionId, sessionId)
			))
			.get();

		if (existing) {
			db.update(trainingSpotVotes)
				.set({ spotId })
				.where(eq(trainingSpotVotes.id, existing.id))
				.run();
		} else {
			db.insert(trainingSpotVotes).values({
				userId: locals.user.id,
				sessionId,
				spotId
			}).run();
		}

		return json({ success: true });
	}

	if (action === 'remove_vote') {
		db.delete(trainingSpotVotes)
			.where(and(
				eq(trainingSpotVotes.userId, locals.user.id),
				eq(trainingSpotVotes.sessionId, sessionId)
			))
			.run();

		return json({ success: true });
	}

	return json({ error: 'Ungültige Aktion' }, { status: 400 });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const { sessionId } = await request.json();

	db.delete(absences)
		.where(and(eq(absences.userId, locals.user.id), eq(absences.sessionId, sessionId)))
		.run();

	return json({ success: true });
};
