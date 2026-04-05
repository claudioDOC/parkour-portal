import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';
import { desc, sql } from 'drizzle-orm';
import { asNum } from '$lib/server/asSqlNumber';

function assertAdmin(locals: App.Locals) {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Nur für Admins');
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	assertAdmin(locals);

	const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '80', 10)));
	const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

	const countRow = db.select({ count: sql<number>`count(*)` }).from(auditLogs).get();
	const total = asNum(countRow?.count ?? 0);

	const rows = db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(limit).offset(offset).all();

	const logs = rows.map((r) => ({
		id: r.id,
		createdAt: r.createdAt,
		action: r.action,
		actorUserId: r.actorUserId,
		actorUsername: r.actorUsername,
		targetUserId: r.targetUserId,
		ip: r.ip,
		detail: r.detailJson ? safeParseJson(r.detailJson) : null
	}));

	return json({ logs, total });
};

function safeParseJson(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}
