-- Strafrunde für stilles Fernbleiben.
--
-- Wer ohne Abmeldung nicht auftaucht, bekommt bis zum nächsten Training
-- eine spielerische Strafe: Warnhinweis beim Öffnen, „Wer zieht" nur als
-- Fragezeichen und beim nächsten Training ein falscher (naher) Spot.
-- Die Zeile entsteht automatisch, sobald ein Admin „nicht erschienen"
-- einträgt; sie läuft mit dem Ende des Straf-Trainings von selbst aus.
CREATE TABLE IF NOT EXISTS no_show_penalties (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id),
	missed_session_id INTEGER NOT NULL REFERENCES training_sessions(id),
	penalty_session_id INTEGER NOT NULL REFERENCES training_sessions(id),
	absence_id INTEGER,
	created_by INTEGER,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS no_show_penalties_user_idx ON no_show_penalties (user_id);
