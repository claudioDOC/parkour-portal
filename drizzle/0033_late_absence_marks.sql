-- Kurzfristige Abmeldung (weniger als 2 h vor Beginn) ist nur als Notfall
-- mit dreifacher Bestätigung möglich und hinterlässt eine Markierung:
-- der Name erscheint eine Woche lang rot. Ziel: Abmelden mindestens
-- zwei Stunden vorher, damit Spot und Planung nicht kippen.
CREATE TABLE IF NOT EXISTS late_absence_marks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id),
	session_id INTEGER NOT NULL REFERENCES training_sessions(id),
	minutes_before INTEGER NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS late_absence_marks_user_idx ON late_absence_marks (user_id, expires_at);
