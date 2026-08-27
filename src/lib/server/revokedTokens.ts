import { createHash } from 'node:crypto';
import { sqliteDb } from './db';

/**
 * Entwertete Sitzungs-Tokens.
 *
 * JWTs sind zustandslos: Einmal ausgestellt, gelten sie bis zum Ablauf —
 * auch nach dem Abmelden. Genau das war die Lücke. Statt beim Logout die
 * `session_version` zu erhöhen (das würde ALLE Geräte abmelden, also auch
 * das Handy, wenn man sich am Rechner abmeldet), merkt sich der Server
 * hier den Fingerabdruck genau dieses einen Tokens.
 *
 * Gespeichert wird nur ein SHA-256-Hash — wer die Datenbank liest, kann
 * daraus keine gültige Sitzung bauen.
 */
function tableReady(): boolean {
	try {
		return Boolean(
			sqliteDb
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='revoked_tokens'")
				.get()
		);
	} catch {
		return false;
	}
}

let ready: boolean | null = null;
function available(): boolean {
	if (ready === null) ready = tableReady();
	return ready;
}

function hash(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Beim Abmelden aufrufen. `exp` ist der Ablauf aus dem Token (Sekunden). */
export function revokeToken(token: string, userId: number, expSeconds: number | undefined): void {
	if (!available()) return;
	try {
		sqliteDb
			.prepare(
				'INSERT OR REPLACE INTO revoked_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
			)
			.run(hash(token), userId, expSeconds ?? Math.floor(Date.now() / 1000) + 30 * 86400);
		// Gelegentlich aufräumen — abgelaufene Tokens sind ohnehin wertlos.
		sqliteDb.prepare('DELETE FROM revoked_tokens WHERE expires_at < ?').run(
			Math.floor(Date.now() / 1000)
		);
	} catch {
		/* Abmelden darf nie an der Buchführung scheitern */
	}
}

export function isTokenRevoked(token: string): boolean {
	if (!available()) return false;
	try {
		return Boolean(
			sqliteDb.prepare('SELECT 1 FROM revoked_tokens WHERE token_hash = ?').get(hash(token))
		);
	} catch {
		return false;
	}
}
