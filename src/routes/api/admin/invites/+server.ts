import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { invites, users } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { logAudit } from '$lib/server/audit';

function errMeta(e: unknown): { msg: string; code: string } {
	if (e && typeof e === 'object' && 'message' in e) {
		const m = (e as { message: unknown }).message;
		const c = (e as { code?: unknown }).code;
		return {
			msg: typeof m === 'string' ? m : String(m),
			code: c != null ? String(c) : ''
		};
	}
	return { msg: String(e), code: '' };
}

function looksLikeSqlite(msg: string, code: string): boolean {
	if (code.startsWith('SQLITE_')) return true;
	const u = msg.toUpperCase();
	return (
		u.includes('SQLITE') ||
		msg.includes('no such table') ||
		msg.includes('no such column') ||
		msg.includes('readonly database') ||
		msg.includes('SQL logic error') ||
		msg.includes('constraint failed') ||
		msg.includes('locked') ||
		msg.includes('SqliteError')
	);
}

/** Reine JSON-Werte (kein BigInt) — vermeidet 500 „Internal Error“ beim Serialisieren in Prod. */
function inviteRowApi(row: {
	id: unknown;
	token: string;
	used: boolean;
	expiresAt: string;
	createdAt: string;
	createdBy?: number;
	usedBy?: number | null;
}) {
	return {
		id: Number(row.id),
		token: row.token,
		used: Boolean(row.used),
		expiresAt: row.expiresAt,
		createdAt: row.createdAt,
		...(row.createdBy !== undefined ? { createdBy: Number(row.createdBy) } : {}),
		...(row.usedBy !== undefined ? { usedBy: row.usedBy == null ? null : Number(row.usedBy) } : {})
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Kein Zugriff');

	try {
		const allInvites = db
			.select({
				id: invites.id,
				token: invites.token,
				used: invites.used,
				expiresAt: invites.expiresAt,
				createdAt: invites.createdAt,
				createdByName: users.username
			})
			.from(invites)
			.leftJoin(users, eq(invites.createdBy, users.id))
			.orderBy(desc(invites.createdAt))
			.all();

		return json({
			invites: allInvites.map((row) => ({
				...inviteRowApi(row),
				createdByName: row.createdByName ?? '(unbekannt)'
			}))
		});
	} catch (e) {
		console.error('GET /api/admin/invites', e);
		return json({ error: 'Einladungen konnten nicht geladen werden', invites: [] }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { locals } = event;
	if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Kein Zugriff');

	try {
		const dbUser = db.select({ id: users.id }).from(users).where(eq(users.id, locals.user.id)).get();
		if (!dbUser) {
			return json(
				{
					error:
						'Dein Account ist in der Datenbank nicht mehr vorhanden — bitte abmelden und mit einem gültigen Admin neu anmelden.'
				},
				{ status: 401 }
			);
		}

		// Hex: überall unterstützt; eindeutiger Lookup nach Insert ohne lastInsertRowid
		const token = randomBytes(32).toString('hex');

		const expires = new Date();
		expires.setDate(expires.getDate() + 7);

		db.insert(invites).values({
			token,
			createdBy: locals.user.id,
			expiresAt: expires.toISOString()
		}).run();

		const result = db.select().from(invites).where(eq(invites.token, token)).get();
		if (!result || result.token == null || result.id == null) {
			console.error('invite insert: Zeile nach Insert per token nicht gefunden');
			return json({ error: 'Einladung konnte nicht gespeichert werden' }, { status: 500 });
		}

		logAudit({
			event,
			action: 'admin.invite.created',
			actorUserId: locals.user.id,
			actorUsername: locals.user.username,
			detail: { inviteId: Number(result.id), expiresAt: result.expiresAt }
		});

		return json({ success: true, invite: inviteRowApi(result) });
	} catch (e) {
		console.error('POST /api/admin/invites', e);
		const { msg, code } = errMeta(e);
		const detail = msg.replace(/\s+/g, ' ').trim().slice(0, 400);

		if (
			msg.includes('FOREIGN KEY') ||
			msg.includes('SQLITE_CONSTRAINT_FOREIGNKEY') ||
			code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
		) {
			return json(
				{
					error:
						'Datenbank lehnt den Eintrag ab (z. B. nach DB-Restore). Bitte abmelden und erneut mit Admin anmelden.',
					detail
				},
				{ status: 500 }
			);
		}

		if (looksLikeSqlite(msg, code)) {
			return json(
				{
					error: 'Datenbankfehler beim Erstellen der Einladung.',
					detail
				},
				{ status: 500 }
			);
		}

		return json(
			{
				error: 'Serverfehler beim Erstellen der Einladung.',
				detail: detail || undefined
			},
			{ status: 500 }
		);
	}
};
