-- Live-Standort am Spot („Bin da"): eine Zeile pro Person, verfällt nach
-- 45 Minuten ohne Aktualisierung. Sichtbar nur für Leute, die selbst teilen.
CREATE TABLE IF NOT EXISTS live_positions (
	user_id INTEGER PRIMARY KEY REFERENCES users(id),
	latitude REAL NOT NULL,
	longitude REAL NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
