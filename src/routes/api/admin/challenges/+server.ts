import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { spotChallenges, spotChallengeCompletions, spots, users } from '$lib/server/db/schema';
import { isSpotChallengesSchemaReady } from '$lib/server/spotChallengesSchemaReady';
import { logAudit } from '$lib/server/audit';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (locals.user.role !== 'admin' && locals.user.role !== 'spotmanager') {
		throw error(403, 'Keine Berechtigung');
	}

	const trashed = url.searchParams.get('trashed') === 'true' || url.searchParams.get('trashed') === '1';
	if (!trashed) {
		return json({ challenges: [] });
	}

	if (!isSpotChallengesSchemaReady()) {
		return json({ challenges: [] });
	}

	const rows = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			description: spotChallenges.description,
			spotId: spotChallenges.spotId,
			spotName: spots.name,
			createdByName: users.username,
			deletedAt: spotChallenges.deletedAt
		})
		.from(spotChallenges)
		.innerJoin(spots, eq(spotChallenges.spotId, spots.id))
		.innerJoin(users, eq(spotChallenges.createdBy, users.id))
		.where(eq(spotChallenges.deleted, true))
		.orderBy(desc(spotChallenges.deletedAt))
		.all();

	return json({ challenges: rows });
};

/** Endgültiges Löschen nur für Challenges, die bereits im Papierkorb (soft-deleted) sind. */
export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	if (locals.user.role !== 'admin' && locals.user.role !== 'spotmanager') {
		throw error(403, 'Keine Berechtigung');
	}
	if (!isSpotChallengesSchemaReady()) {
		return json({ error: 'Challenges-Schema nicht bereit' }, { status: 503 });
	}

	let body: { challengeId?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ungültige Anfrage' }, { status: 400 });
	}
	const challengeId = Number(body?.challengeId);
	if (!challengeId) {
		return json({ error: 'challengeId erforderlich' }, { status: 400 });
	}

	const ch = db
		.select({
			id: spotChallenges.id,
			title: spotChallenges.title,
			spotId: spotChallenges.spotId,
			deleted: spotChallenges.deleted
		})
		.from(spotChallenges)
		.where(eq(spotChallenges.id, challengeId))
		.get();

	if (!ch) {
		return json({ error: 'Challenge nicht gefunden' }, { status: 404 });
	}
	if (!ch.deleted) {
		return json({ error: 'Nur Challenges im Papierkorb können endgültig gelöscht werden' }, { status: 400 });
	}

	const spot = db.select({ name: spots.name }).from(spots).where(eq(spots.id, ch.spotId)).get();

	db.delete(spotChallengeCompletions).where(eq(spotChallengeCompletions.challengeId, challengeId)).run();
	db.delete(spotChallenges).where(eq(spotChallenges.id, challengeId)).run();

	logAudit({
		event,
		action: 'spot.challenge.purge',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: {
			spotId: ch.spotId,
			spotName: spot?.name,
			challengeId: ch.id,
			challengeTitle: ch.title
		}
	});

	return json({ success: true });
};
