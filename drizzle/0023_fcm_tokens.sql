-- Geräte-Token der nativen App für Firebase Cloud Messaging (Push).
-- Ein Token pro Gerät; bei Neuinstallation kommt ein neues, tote werden
-- nach wiederholten Zustellfehlern aufgeräumt.
CREATE TABLE IF NOT EXISTS fcm_tokens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id),
	token TEXT NOT NULL UNIQUE,
	failure_count INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
