import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { spots, spotChallenges, spotChallengeCompletions } from '$lib/server/db/schema';
import { logAudit } from '$lib/server/audit';

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const spotId = Number(body?.spotId);
	const title = String(body?.title ?? '').trim();
	const descriptionRaw = String(body?.description ?? '').trim();
	const description = descriptionRaw.length > 0 ? descriptionRaw : null;

	if (!spotId || !title) {
		return json({ error: 'Spot-ID und Titel sind erforderlich' }, { status: 400 });
	}
	if (title.length > 120) {
		return json({ error: 'Titel ist zu lang (max. 120 Zeichen)' }, { status: 400 });
	}
	if (description && description.length > 600) {
		return json({ error: 'Beschreibung ist zu lang (max. 600 Zeichen)' }, { status: 400 });
	}

	const spot = db.select({ id: spots.id, name: spots.name }).from(spots).where(eq(spots.id, spotId)).get();
	if (!spot) {
		return json({ error: 'Spot nicht gefunden' }, { status: 404 });
	}

	const created = db
		.insert(spotChallenges)
		.values({
			spotId,
			title,
			description,
			createdBy: locals.user.id
		})
		.returning()
		.get();

	logAudit({
		event,
		action: 'spot.challenge.create',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { spotId, spotName: spot.name, challengeId: created.id, title }
	});

	return json({ success: true, challenge: created });
};

export const PATCH: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const challengeId = Number(body?.challengeId);
	const done = Boolean(body?.done);

	if (!challengeId) {
		return json({ error: 'Challenge-ID erforderlich' }, { status: 400 });
	}

	const challenge = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			spotId: spotChallenges.spotId
		})
		.from(spotChallenges)
		.where(eq(spotChallenges.id, challengeId))
		.get();

	if (!challenge) {
		return json({ error: 'Challenge nicht gefunden' }, { status: 404 });
	}

	if (done) {
		const existing = db
			.select({ id: spotChallengeCompletions.id })
			.from(spotChallengeCompletions)
			.where(
				and(
					eq(spotChallengeCompletions.challengeId, challengeId),
					eq(spotChallengeCompletions.userId, locals.user.id)
				)
			)
			.get();
		if (!existing) {
			db.insert(spotChallengeCompletions)
				.values({
					challengeId,
					userId: locals.user.id
				})
				.run();
		}
	} else {
		db.delete(spotChallengeCompletions)
			.where(
				and(
					eq(spotChallengeCompletions.challengeId, challengeId),
					eq(spotChallengeCompletions.userId, locals.user.id)
				)
			)
			.run();
	}

	logAudit({
		event,
		action: done ? 'spot.challenge.complete' : 'spot.challenge.uncomplete',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: {
			spotId: challenge.spotId,
			challengeId: challenge.id,
			challengeTitle: challenge.title
		}
	});

	return json({ success: true });
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	const body = await request.json();
	const challengeId = Number(body?.challengeId);
	if (!challengeId) {
		return json({ error: 'Challenge-ID erforderlich' }, { status: 400 });
	}

	const challenge = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			spotId: spotChallenges.spotId,
			createdBy: spotChallenges.createdBy
		})
		.from(spotChallenges)
		.where(eq(spotChallenges.id, challengeId))
		.get();

	if (!challenge) {
		return json({ error: 'Challenge nicht gefunden' }, { status: 404 });
	}

	const canDelete =
		challenge.createdBy === locals.user.id ||
		locals.user.role === 'admin' ||
		locals.user.role === 'spotmanager';

	if (!canDelete) {
		return json({ error: 'Nur Ersteller, Spotmanager oder Admin dürfen löschen' }, { status: 403 });
	}

	db.delete(spotChallengeCompletions).where(eq(spotChallengeCompletions.challengeId, challengeId)).run();
	db.delete(spotChallenges).where(eq(spotChallenges.id, challengeId)).run();

	logAudit({
		event,
		action: 'spot.challenge.delete',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: {
			spotId: challenge.spotId,
			challengeId: challenge.id,
			challengeTitle: challenge.title
		}
	});

	return json({ success: true });
};
