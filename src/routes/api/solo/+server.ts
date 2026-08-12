import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { soloTrainings } from '$lib/server/db/schema';
import { todayYmdInAppTZ } from '$lib/server/calendarToday';
import { logAudit } from '$lib/server/audit';

function addDaysYmd(ymd: string, days: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Solo-Training eintragen — heute oder bis 14 Tage rückwirkend. */
export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let body: { date?: unknown; note?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}

	const today = todayYmdInAppTZ();
	const date =
		typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today;
	if (date > today) {
		return json({ error: 'Solo-Trainings kann man nicht vorausbuchen 😄' }, { status: 400 });
	}
	if (date < addDaysYmd(today, -14)) {
		return json({ error: 'Nachtragen geht bis 14 Tage zurück' }, { status: 400 });
	}
	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null;

	const existing = db
		.select({ id: soloTrainings.id })
		.from(soloTrainings)
		.where(and(eq(soloTrainings.userId, locals.user.id), eq(soloTrainings.date, date)))
		.get();
	if (existing) {
		return json({ error: 'Für diesen Tag ist schon ein Solo-Training eingetragen' }, { status: 400 });
	}

	const created = db
		.insert(soloTrainings)
		.values({ userId: locals.user.id, date, note })
		.returning()
		.get();

	logAudit({
		event,
		action: 'training.solo.add',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { date, note: note ?? undefined }
	});

	return json({ ok: true, entry: created });
};

/** Eigenen Eintrag wieder entfernen. */
export const DELETE: RequestHandler = async (event) => {
	const { request, locals } = event;
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let body: { id?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}
	const id = Number(body.id);
	if (!Number.isFinite(id) || id <= 0) throw error(400, 'ID fehlt');

	const row = db
		.select({ id: soloTrainings.id, date: soloTrainings.date })
		.from(soloTrainings)
		.where(and(eq(soloTrainings.id, id), eq(soloTrainings.userId, locals.user.id)))
		.get();
	if (!row) return json({ error: 'Eintrag nicht gefunden' }, { status: 404 });

	db.delete(soloTrainings).where(eq(soloTrainings.id, id)).run();

	logAudit({
		event,
		action: 'training.solo.remove',
		actorUserId: locals.user.id,
		actorUsername: locals.user.username,
		detail: { date: row.date }
	});

	return json({ ok: true });
};
