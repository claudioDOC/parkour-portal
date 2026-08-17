import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { livePositions, users } from '$lib/server/db/schema';
import { eq, lt, sql } from 'drizzle-orm';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';

/**
 * Live-Standort am Spot („Bin da"): Wer teilt, sieht die anderen Teilenden —
 * wer nicht teilt, sieht niemanden. Positionen verfallen nach 45 Minuten
 * ohne Aktualisierung; abgelaufene Zeilen werden bei jedem Abruf entsorgt.
 */
const TTL_MINUTES = 45;

function purgeStale(): void {
	db.delete(livePositions)
		.where(lt(livePositions.updatedAt, sql`datetime('now', '-' || ${TTL_MINUTES} || ' minutes')`))
		.run();
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	purgeStale();
	const rows = db
		.select({
			userId: livePositions.userId,
			latitude: livePositions.latitude,
			longitude: livePositions.longitude,
			updatedAt: livePositions.updatedAt,
			username: users.username,
			avatar: users.avatar
		})
		.from(livePositions)
		.innerJoin(users, eq(users.id, livePositions.userId))
		.where(usersNotDeletedCondition())
		.all()
		.map((r) => ({ ...r, avatar: r.avatar ? `/uploads/${r.avatar}` : null }));
	const sharing = rows.some((r) => r.userId === locals.user!.id);
	// Gegenseitigkeit: Positionen gibt es nur, wenn man selbst teilt.
	return json({ sharing, positions: sharing ? rows : [], ttlMinutes: TTL_MINUTES });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	const body = (await request.json().catch(() => ({}))) as {
		latitude?: number;
		longitude?: number;
	};
	const lat = Number(body?.latitude);
	const lon = Number(body?.longitude);
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
		throw error(400, 'Ungültige Koordinaten');
	}
	db.insert(livePositions)
		.values({ userId: locals.user.id, latitude: lat, longitude: lon })
		.onConflictDoUpdate({
			target: livePositions.userId,
			set: { latitude: lat, longitude: lon, updatedAt: sql`datetime('now')` }
		})
		.run();
	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	db.delete(livePositions).where(eq(livePositions.userId, locals.user.id)).run();
	return json({ success: true });
};
