import type { RequestEvent } from '@sveltejs/kit';
import { db, sqliteDb } from '$lib/server/db';
import { users, invites } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword, createSession } from '$lib/server/auth';
import { logAudit } from '$lib/server/audit';
import { checkPasswordPolicy } from '$lib/passwordPolicy';
import { getClientIp, rateLimitAuthRegister } from '$lib/server/rateLimitAuth';
import { getUserCoreById } from '$lib/server/userCoreQuery';

export type RegisterWithInviteResult =
	| { kind: 'success'; user: { id: number; username: string; role: string } }
	| { kind: 'error'; status: number; error: string; retryAfterSec?: number };

/**
 * Registrierung per Einladungstoken. Optional `passwordConfirm`: wenn gesetzt, muss mit Passwort übereinstimmen (Formular).
 */
export async function registerWithInvite(
	event: RequestEvent,
	username: unknown,
	password: unknown,
	token: unknown,
	passwordConfirm?: unknown
): Promise<RegisterWithInviteResult> {
	const ip = getClientIp(event);
	const limited = rateLimitAuthRegister(ip);
	if (!limited.ok) {
		return {
			kind: 'error',
			status: 429,
			error: 'Zu viele Registrierungsversuche von dieser Verbindung. Bitte später erneut versuchen.',
			retryAfterSec: limited.retryAfterSec
		};
	}

	const t = typeof token === 'string' ? token.trim() : String(token ?? '');
	const u = typeof username === 'string' ? username.trim() : String(username ?? '').trim();
	const p = typeof password === 'string' ? password : String(password ?? '');

	if (passwordConfirm !== undefined) {
		const pc = typeof passwordConfirm === 'string' ? passwordConfirm : String(passwordConfirm ?? '');
		if (p !== pc) {
			return { kind: 'error', status: 400, error: 'Passwörter stimmen nicht überein' };
		}
	}

	if (!u || !p || !t) {
		return { kind: 'error', status: 400, error: 'Alle Felder sind erforderlich' };
	}

	if (u.length < 3) {
		return { kind: 'error', status: 400, error: 'Username muss mindestens 3 Zeichen lang sein' };
	}
	if (u.length > 30) {
		return { kind: 'error', status: 400, error: 'Username darf höchstens 30 Zeichen lang sein' };
	}
	/**
	 * Namen tauchen überall auf — auch in Kartenblasen, die als HTML
	 * gezeichnet werden. Statt sich allein auf Maskierung an jeder
	 * Anzeigestelle zu verlassen, kommen Steuerzeichen gar nicht erst
	 * herein. Buchstaben (inkl. Umlauten), Ziffern, Leerzeichen und
	 * . _ - reichen für jeden Namen in dieser Gruppe.
	 */
	if (!/^[\p{L}\p{N} ._-]+$/u.test(u)) {
		return {
			kind: 'error',
			status: 400,
			error: 'Username darf nur Buchstaben, Ziffern, Leerzeichen sowie . _ - enthalten'
		};
	}

	const policy = checkPasswordPolicy(p, u);
	if (!policy.ok) {
		return { kind: 'error', status: 400, error: policy.error };
	}

	const invite = db
		.select()
		.from(invites)
		.where(and(eq(invites.token, t), eq(invites.used, false)))
		.get();

	if (!invite) {
		return { kind: 'error', status: 400, error: 'Ungültiger oder bereits verwendeter Einladungslink' };
	}

	const now = new Date().toISOString();
	if (invite.expiresAt < now) {
		return { kind: 'error', status: 400, error: 'Einladungslink ist abgelaufen' };
	}

	const existingUser = db.select({ id: users.id }).from(users).where(eq(users.username, u)).get();
	if (existingUser) {
		return { kind: 'error', status: 400, error: 'Username bereits vergeben' };
	}

	// Hashing dauert bewusst lange und gibt dabei den Event-Loop frei.
	// Deshalb ZUERST hashen und erst danach den Link einlösen — sonst
	// passen zwei gleichzeitige Registrierungen genau in dieses Fenster
	// und verbrauchen denselben Link doppelt (im Audit nachgewiesen:
	// drei Konten aus einem Link).
	const passwordHash = await hashPassword(p);

	// Prüfen und Einlösen in EINEM Schritt: Nur wer die Zeile tatsächlich
	// von „offen" auf „benutzt" dreht, darf weitermachen.
	const claim = sqliteDb
		.prepare('UPDATE invites SET used = 1 WHERE id = ? AND used = 0')
		.run(invite.id);
	if (claim.changes !== 1) {
		return {
			kind: 'error',
			status: 400,
			error: 'Ungültiger oder bereits verwendeter Einladungslink'
		};
	}

	/** Drizzle-`insert(users)` listet alle Schema-Spalten (z. B. `deleted`) — auf DBs ohne Migrationen schlägt das fehl. Nur die Basisspalten wie in `0000_old_vertigo.sql`. */
	let insertRun;
	try {
		insertRun = sqliteDb
			.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
			.run(u, passwordHash, 'member');
	} catch (e) {
		// Konto anlegen misslungen (etwa Name inzwischen vergeben) — die
		// Einladung wieder freigeben, sonst wäre sie grundlos verbraucht.
		sqliteDb.prepare('UPDATE invites SET used = 0 WHERE id = ?').run(invite.id);
		throw e;
	}
	const newId = Number(insertRun.lastInsertRowid);

	const core = getUserCoreById(newId);
	if (!core) {
		return {
			kind: 'error',
			status: 500,
			error: 'Registrierung fehlgeschlagen. Bitte einen Admin informieren.'
		};
	}

	// `used` steht schon aus dem atomaren Einlösen; hier wird nur noch
	// festgehalten, wer den Link verbraucht hat.
	db.update(invites).set({ usedBy: newId }).where(eq(invites.id, invite.id)).run();

	createSession(
		{
			id: core.id,
			username: core.username,
			role: core.role,
			sessionVersion: core.sessionVersion
		},
		event.cookies
	);
	logAudit({
		event,
		action: 'auth.register',
		actorUserId: core.id,
		actorUsername: core.username,
		detail: { inviteId: invite.id }
	});

	return {
		kind: 'success',
		user: { id: core.id, username: core.username, role: core.role }
	};
}
