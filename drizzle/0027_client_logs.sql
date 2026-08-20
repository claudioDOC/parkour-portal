-- Fehlerberichte der App: Bisher liess sich ein Absturz auf fremden
-- Geräten nur raten. Die App meldet jetzt Start, Version und Fehler —
-- damit auf dem Server nachlesbar ist, WER mit WELCHER Version wobei
-- gescheitert ist.
CREATE TABLE IF NOT EXISTS client_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	user_id INTEGER REFERENCES users(id),
	username TEXT,
	platform TEXT,
	app_version TEXT,
	runtime_version TEXT,
	update_id TEXT,
	device TEXT,
	kind TEXT NOT NULL,
	message TEXT NOT NULL,
	stack TEXT,
	extra TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS client_logs_created ON client_logs (created_at);
