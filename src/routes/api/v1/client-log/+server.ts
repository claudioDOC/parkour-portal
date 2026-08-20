import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { clientLogs } from '$lib/server/db/schema';
import { and, desc, eq, lt } from 'drizzle-orm';

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
				appBuild: trim(body.appBuild, 20),
				runtimeVersion: trim(body.runtimeVersion, 30),
				updateId: trim(body.updateId, 60),
				device: trim(body.device, 160),
				os: trim(body.os, 20),
				osVersion: trim(body.osVersion, 30),
				model: trim(body.model, 60),
				manufacturer: trim(body.manufacturer, 60),
				route: trim(body.route, 120),
				sessionId: trim(body.sessionId, 40),
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
	const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
	const kindFilter = url.searchParams.get('kind');
	const userFilter = url.searchParams.get('user');
	const versionFilter = url.searchParams.get('version');

	const conditions = [
		kindFilter && kindFilter !== 'alle' ? eq(clientLogs.kind, kindFilter) : null,
		userFilter && userFilter !== 'alle' ? eq(clientLogs.username, userFilter) : null,
		versionFilter && versionFilter !== 'alle' ? eq(clientLogs.appVersion, versionFilter) : null
	].filter(Boolean);

	const base = db.select().from(clientLogs);
	const entries = (conditions.length ? base.where(and(...(conditions as never[]))) : base)
		.orderBy(desc(clientLogs.id))
		.limit(limit)
		.all();

	// Auswahlwerte für die Filter — aus dem tatsächlichen Bestand.
	const all = db
		.select({
			kind: clientLogs.kind,
			username: clientLogs.username,
			appVersion: clientLogs.appVersion
		})
		.from(clientLogs)
		.orderBy(desc(clientLogs.id))
		.limit(1000)
		.all();
	const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
	return json({
		entries,
		filters: {
			kinds: uniq(all.map((r) => r.kind)),
			users: uniq(all.map((r) => r.username)),
			versions: uniq(all.map((r) => r.appVersion))
		}
	});
};
