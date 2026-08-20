import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clientLogs } from '$lib/server/db/schema';
import { desc, lt } from 'drizzle-orm';

/**
 * Fehlerberichte der App entgegennehmen.
 *
 * Bewusst OHNE Login-Zwang: Ein Absturz passiert oft, bevor jemand
 * angemeldet ist — gerade dann ist der Bericht wertvoll. Dafür wird
 * knapp begrenzt, was gespeichert wird, und alles Alte fliegt raus.
 */
const MAX_TEXT = 4000;
const KEEP_DAYS = 30;

const trim = (v: unknown, max = 300) =>
	typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Ungültiger Body' }, { status: 400 });
	}

	const message = trim(body.message, MAX_TEXT);
	if (!message) return json({ error: 'message fehlt' }, { status: 400 });

	const kind = trim(body.kind, 20) ?? 'error';
	try {
		db.insert(clientLogs)
			.values({
				userId: locals.user?.id ?? null,
				username: locals.user?.username ?? trim(body.username, 60),
				platform: trim(body.platform, 20),
				appVersion: trim(body.appVersion, 30),
				runtimeVersion: trim(body.runtimeVersion, 30),
				updateId: trim(body.updateId, 60),
				device: trim(body.device, 120),
				kind,
				message,
				stack: trim(body.stack, MAX_TEXT),
				extra: trim(body.extra, MAX_TEXT)
			})
			.run();

		// Im Server-Protokoll mitschreiben, damit es auch ohne Admin-Ansicht
		// sofort sichtbar ist.
		const who = locals.user?.username ?? trim(body.username, 60) ?? 'unbekannt';
		const line = `[app-${kind}] ${who} · ${trim(body.appVersion, 30) ?? '?'} · ${message.slice(0, 300)}`;
		if (kind === 'crash' || kind === 'error') console.error(line);
		else console.log(line);

		const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
		db.delete(clientLogs).where(lt(clientLogs.createdAt, cutoff)).run();
	} catch (e) {
		console.error('client-log insert failed', e);
		return json({ ok: false }, { status: 500 });
	}
	return json({ ok: true });
};

/** Letzte Meldungen — nur für Admins (Admin-Bereich, Reiter „Fehler"). */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		return json({ error: 'Keine Berechtigung' }, { status: 403 });
	}
	const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 80)));
	const entries = db.select().from(clientLogs).orderBy(desc(clientLogs.id)).limit(limit).all();
	return json({ entries });
};
