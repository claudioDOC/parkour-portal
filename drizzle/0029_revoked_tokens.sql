-- Abgemeldete Tokens.
--
-- Ein JWT ist bis zum Ablauf gültig, egal was der Server denkt. Der
-- normale Logout löschte bisher nur das Cookie — ein abgegriffenes Token
-- blieb 30 Tage brauchbar. Hier landet der Fingerabdruck des Tokens beim
-- Abmelden; abgelaufene Zeilen räumt der Server selbst weg.
--
-- Bewusst nicht über session_version: Das würde ALLE Geräte abmelden.
CREATE TABLE IF NOT EXISTS revoked_tokens (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS revoked_tokens_expires ON revoked_tokens (expires_at);
