import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { soloTrainings, users } from '$lib/server/db/schema';
import { usersNotDeletedCondition } from '$lib/server/usersWhere';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { logAudit } from '$lib/server/audit';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

/** Alle Solo-Einträge (neueste zuerst) für die Admin-Verwaltung. */
export const GET: RequestHandler = async ({ locals }) => {
	assertAdmin(locals);
	const entries = db
		.select({
			id: soloTrainings.id,
			userId: soloTrainings.userId,
			username: users.username,
			date: soloTrainings.date,
			note: soloTrainings.note
		})
		.from(soloTrainings)
		.innerJoin(users, eq(users.id, soloTrainings.userId))
		.orderBy(desc(soloTrainings.date), desc(soloTrainings.id))
		.limit(100)
		.all();
	return json({ entries });
};

/** Solo-Training für einen beliebigen User eintragen (Admin darf weiter zurück). */
export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);

	let body: { userId?: unknown; date?: unknown; note?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}

	const userId = Number(body.userId);
	if (!Number.isFinite(userId) || userId <= 0) {
		return json({ error: 'User fehlt' }, { status: 400 });
	}
	const target = db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(and(eq(users.id, userId), usersNotDeletedCondition()))
		.get();
	if (!target) return json({ error: 'User nicht gefunden' }, { status: 404 });

	const today = todayYmdInAppTZ();
	const date =
		typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
	if (date > today) return json({ error: 'Datum liegt in der Zukunft' }, { status: 400 });

	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null;

	const existing = db
		.select({ id: soloTrainings.id })
		.from(soloTrainings)
		.where(and(eq(soloTrainings.userId, userId), eq(soloTrainings.date, date)))
		.get();
	if (existing) {
		return json({ error: `${target.username} hat an dem Tag schon einen Eintrag` }, { status: 400 });
	}

	db.insert(soloTrainings).values({ userId, date, note }).run();

	logAudit({
		event,
		action: 'admin.solo.add',
		actorUserId: locals.user!.id,
		actorUsername: locals.user!.username,
		targetUserId: userId,
		detail: { date, note: note ?? undefined }
	});

	return json({ ok: true });
};

/** Beliebigen Solo-Eintrag löschen. */
export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	assertAdmin(locals);

	let body: { id?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}
	const id = Number(body.id);
	if (!Number.isFinite(id) || id <= 0) throw error(400, 'ID fehlt');

	const row = db
		.select({ id: soloTrainings.id, userId: soloTrainings.userId, date: soloTrainings.date })
		.from(soloTrainings)
		.where(eq(soloTrainings.id, id))
		.get();
	if (!row) return json({ error: 'Eintrag nicht gefunden' }, { status: 404 });

	db.delete(soloTrainings).where(eq(soloTrainings.id, id)).run();

	logAudit({
		event,
		action: 'admin.solo.remove',
		actorUserId: locals.user!.id,
		actorUsername: locals.user!.username,
		targetUserId: row.userId,
		detail: { date: row.date }
	});

	return json({ ok: true });
};
