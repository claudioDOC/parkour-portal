import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pushReminderLog, pushSubscriptions } from '$lib/server/db/schema';
import { isPushConfigured, sendToUsers } from '$lib/server/push';
import { logAudit } from '$lib/server/audit';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

/** Push-Überblick: Gerätezahl, erreichte User, letzte automatische Sendungen. */
export const GET: RequestHandler = async ({ locals }) => {
	assertAdmin(locals);

	let deviceCount = 0;
	let userCount = 0;
	let recent: { sessionId: number; kind: string; sentAt: string }[] = [];
	try {
		deviceCount = db.select({ c: sql<number>`COUNT(*)` }).from(pushSubscriptions).get()?.c ?? 0;
		userCount =
			db
				.select({ c: sql<number>`COUNT(DISTINCT user_id)` })
				.from(pushSubscriptions)
				.get()?.c ?? 0;
		recent = db
			.select({
				sessionId: pushReminderLog.sessionId,
				kind: pushReminderLog.kind,
				sentAt: pushReminderLog.sentAt
			})
			.from(pushReminderLog)
			.orderBy(desc(pushReminderLog.sentAt))
			.limit(5)
			.all();
	} catch {
		// Tabellen fehlen (Migration ausstehend) — Nullwerte sind aussagekräftig genug.
	}

	return json({ configured: isPushConfigured(), deviceCount, userCount, recent });
};

/** Broadcast: freie Nachricht an alle registrierten Geräte aller User. */
export const POST: RequestHandler = async (event) => {
	const { locals, request } = event;
	assertAdmin(locals);
	if (!isPushConfigured()) throw error(503, 'Push ist auf dem Server nicht konfiguriert');

	let body: { title?: unknown; body?: unknown; url?: unknown };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültiger Body');
	}

	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
	const text = typeof body.body === 'string' ? body.body.trim().slice(0, 300) : '';
	const url = typeof body.url === 'string' && body.url.startsWith('/') ? body.url : '/';
	if (!title || !text) throw error(400, 'Titel und Text sind Pflicht');

	const userIds = db
		.select({ userId: pushSubscriptions.userId })
		.from(pushSubscriptions)
		.all()
		.map((r) => r.userId);
	const unique = [...new Set(userIds)];

	const sent = await sendToUsers(unique, {
		title,
		body: text,
		url,
		// Kein tag: mehrere Broadcasts sollen sich nicht gegenseitig ersetzen.
		tag: `broadcast-${Date.now()}`
	});

	logAudit({
		event,
		action: 'admin.push.broadcast',
		actorUserId: locals.user!.id,
		actorUsername: locals.user!.username,
		detail: { title, body: text, url, sent, userTargets: unique.length }
	});

	return json({ ok: true, sent, userTargets: unique.length });
};
