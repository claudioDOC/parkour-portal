import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { livePositions, trainingSessions, users } from '$lib/server/db/schema';
import { and, eq, lt, sql } from 'drizzle-orm';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { attendingUserIds, claimReminder } from '$lib/server/pushScheduler';
import { sendToUsersWithPref } from '$lib/server/push';

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

/**
 * Meldet den Mitziehenden einmalig, dass jemand am Spot ist.
 *
 * Bewusst gedrosselt: eine Meldung pro Person und Training, nicht bei jeder
 * Positionsaktualisierung (die App schickt alle paar Sekunden eine). Die
 * Sperre liegt in derselben Tabelle wie die übrigen Erinnerungen, überlebt
 * also auch einen Neustart des Servers.
 */
function notifyAtSpot(userId: number, username: string): void {
	const today = todayYmdInAppTZ();
	let session;
	try {
		session = db
			.select()
			.from(trainingSessions)
			.where(and(eq(trainingSessions.date, today), eq(trainingSessions.cancelled, false)))
			.orderBy(trainingSessions.timeStart)
			.get();
	} catch {
		return;
	}
	// Ohne Training heute gibt es niemanden, den es angeht.
	if (!session) return;

	// Nur rund um die Trainingszeit melden: ab zwei Stunden vor Beginn bis
	// eine Stunde nach Schluss. Wer um Mitternacht den Standort teilt, weckt
	// sonst die halbe Gruppe.
	const minutes = (t: string) => {
		const m = /^(\d{2}):(\d{2})$/.exec(t);
		return m ? Number(m[1]) * 60 + Number(m[2]) : null;
	};
	const now = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Zurich',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(new Date());
	const nowMin =
		Number(now.find((p) => p.type === 'hour')?.value ?? 0) * 60 +
		Number(now.find((p) => p.type === 'minute')?.value ?? 0);
	const start = minutes(session.timeStart);
	const end = minutes(session.timeEnd);
	if (start === null || end === null) return;
	if (nowMin < start - 120 || nowMin > end + 60) return;

	if (!claimReminder(session.id, `at-spot-${userId}`)) return;

	const others = attendingUserIds(session.id, session.dayOfWeek, Boolean(session.isExtra)).filter(
		(id) => id !== userId
	);
	if (others.length === 0) return;

	void sendToUsersWithPref(
		'atSpot',
		{
			title: `${username} ist am Spot`,
			body: 'Standort wird geteilt — auf der Trainingsseite siehst du, wer da ist.',
			url: '/training',
			tag: `at-spot-${session.id}`
		},
		others
	).catch(() => undefined);
}

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
	// Die Meldung ist Beiwerk — sie darf das Teilen des Standorts nie
	// scheitern lassen.
	try {
		notifyAtSpot(locals.user.id, locals.user.username);
	} catch (e) {
		console.error('[at-spot] Meldung fehlgeschlagen', e);
	}
	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');
	db.delete(livePositions).where(eq(livePositions.userId, locals.user.id)).run();
	return json({ success: true });
};
