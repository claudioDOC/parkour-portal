import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { spots, spotChallenges, spotChallengeCompletions } from '$lib/server/db/schema';
import { logAudit } from '$lib/server/audit';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';

function schemaNotReadyResponse() {
	return json(
		{
			error: 'Challenges sind noch nicht verfügbar. Auf dem Server zuerst `npm run db:migrate` ausführen (Migration 0007).'
		},
		{ status: 503 }
	);
}

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isSpotChallengesSchemaReady()) return schemaNotReadyResponse();

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
	if (!isSpotChallengesSchemaReady()) return schemaNotReadyResponse();

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
			spotId: spotChallenges.spotId,
			deleted: spotChallenges.deleted
		})
		.from(spotChallenges)
		.where(and(eq(spotChallenges.id, challengeId), eq(spotChallenges.deleted, false)))
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

/** Wiederherstellung nach Soft-Delete (Papierkorb). */
export const PUT: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isSpotChallengesSchemaReady()) return schemaNotReadyResponse();

	const body = await request.json();
	const challengeId = Number(body?.challengeId);
	if (!challengeId) {
		return json({ error: 'Challenge-ID erforderlich' }, { status: 400 });
	}

	const challenge = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			description: spotChallenges.description,
			spotId: spotChallenges.spotId,
			createdBy: spotChallenges.createdBy,
			deleted: spotChallenges.deleted
		})
		.from(spotChallenges)
		.where(eq(spotChallenges.id, challengeId))
		.get();

	if (!challenge || !challenge.deleted) {
		return json({ error: 'Challenge nicht im Papierkorb' }, { status: 404 });
	}

	const canRestore =
		challenge.createdBy === locals.user.id ||
		locals.user.role === 'admin' ||
		locals.user.role === 'spotmanager';

	if (!canRestore) {
		return json({ error: 'Keine Berechtigung zur Wiederherstellung' }, { status: 403 });
	}

	db.update(spotChallenges)
		.set({ deleted: false, deletedAt: null })
		.where(eq(spotChallenges.id, challengeId))
		.run();

	const spot = db.select({ name: spots.name }).from(spots).where(eq(spots.id, challenge.spotId)).get();

	logAudit({
		event,
		action: 'spot.challenge.restore',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: {
			spotId: challenge.spotId,
			spotName: spot?.name,
			challengeId: challenge.id,
			challengeTitle: challenge.title
		}
	});

	return json({ success: true });
};

export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (!isSpotChallengesSchemaReady()) return schemaNotReadyResponse();

	const body = await request.json();
	const challengeId = Number(body?.challengeId);
	if (!challengeId) {
		return json({ error: 'Challenge-ID erforderlich' }, { status: 400 });
	}

	const challenge = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			description: spotChallenges.description,
			spotId: spotChallenges.spotId,
			createdBy: spotChallenges.createdBy,
			deleted: spotChallenges.deleted
		})
		.from(spotChallenges)
		.where(eq(spotChallenges.id, challengeId))
		.get();

	if (!challenge) {
		return json({ error: 'Challenge nicht gefunden' }, { status: 404 });
	}

	if (challenge.deleted) {
		return json({ error: 'Challenge ist bereits im Papierkorb' }, { status: 400 });
	}

	const canDelete =
		challenge.createdBy === locals.user.id ||
		locals.user.role === 'admin' ||
		locals.user.role === 'spotmanager';

	if (!canDelete) {
		return json({ error: 'Nur Ersteller, Spotmanager oder Admin dürfen löschen' }, { status: 403 });
	}

	const spot = db.select({ name: spots.name }).from(spots).where(eq(spots.id, challenge.spotId)).get();

	db.update(spotChallenges)
		.set({ deleted: true, deletedAt: sql`(datetime('now'))` })
		.where(eq(spotChallenges.id, challengeId))
		.run();

	const descPreview =
		challenge.description && challenge.description.length > 400
			? `${challenge.description.slice(0, 400)}…`
			: challenge.description;

	logAudit({
		event,
		action: 'spot.challenge.delete',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: {
			spotId: challenge.spotId,
			spotName: spot?.name,
			challengeId: challenge.id,
			challengeTitle: challenge.title,
			...(descPreview != null ? { challengeDescription: descPreview } : {})
		}
	});

	return json({ success: true });
};
