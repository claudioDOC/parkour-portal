-- Terminumfrage für Trips: Ja / Notfalls / Nein je Datum, Frist, Fixierung.
--
-- Bisher hatte jede Person genau EINE Stimme für EIN Datum — das erzeugt
-- Patts und Hin und Her. Neu antwortet man bei jedem Datum. Erreicht ein
-- Datum drei „Ja", ist der Termin fix; spätestens mit Ablauf der Frist
-- entscheidet der Server. Wer bis zur Frist nichts sagt, sieht nur noch
-- das Datum, bis er zusagt.
ALTER TABLE trip_plans ADD COLUMN vote_deadline TEXT;
--> statement-breakpoint
ALTER TABLE trip_plans ADD COLUMN date_locked_at TEXT;
--> statement-breakpoint
ALTER TABLE trip_plans ADD COLUMN locked_date_option_id INTEGER;
--> statement-breakpoint
ALTER TABLE trip_plans ADD COLUMN deadline_handled_at TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS trip_date_answers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	trip_id INTEGER NOT NULL REFERENCES trip_plans(id),
	date_option_id INTEGER NOT NULL REFERENCES trip_date_options(id),
	user_id INTEGER NOT NULL REFERENCES users(id),
	answer TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS trip_date_answers_option_user ON trip_date_answers (date_option_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trip_date_answers_trip_idx ON trip_date_answers (trip_id);
--> statement-breakpoint
-- Jeder Trip trägt sein eigenes Datum als Option — die Umfrage zeigt so
-- immer alle Kandidaten, nicht nur die Alternativen.
INSERT INTO trip_date_options (trip_id, start_date, end_date, note, proposed_by)
SELECT t.id, t.start_date, t.end_date, NULL, t.created_by
FROM trip_plans t
WHERE NOT EXISTS (
	SELECT 1 FROM trip_date_options o
	WHERE o.trip_id = t.id AND o.start_date = t.start_date AND o.end_date = t.end_date
);
--> statement-breakpoint
-- Alte Einzelstimmen werden zu „Ja".
INSERT OR IGNORE INTO trip_date_answers (trip_id, date_option_id, user_id, answer)
SELECT trip_id, date_option_id, user_id, 'ja' FROM trip_date_votes;
--> statement-breakpoint
-- Wer schon zugesagt hat, hat damit zum geplanten Datum „Ja" gesagt.
INSERT OR IGNORE INTO trip_date_answers (trip_id, date_option_id, user_id, answer)
SELECT p.trip_id, o.id, p.user_id, 'ja'
FROM trip_participants p
JOIN trip_plans t ON t.id = p.trip_id
JOIN trip_date_options o ON o.trip_id = t.id AND o.start_date = t.start_date AND o.end_date = t.end_date
WHERE p.transport_mode NOT IN ('abgemeldet', 'enthalten');
--> statement-breakpoint
-- Laufende Trips mit mindestens drei Zusagen gelten als fix; die übrigen
-- bekommen eine Woche Frist ab jetzt.
UPDATE trip_plans SET
	date_locked_at = datetime('now'),
	locked_date_option_id = (
		SELECT o.id FROM trip_date_options o
		WHERE o.trip_id = trip_plans.id AND o.start_date = trip_plans.start_date AND o.end_date = trip_plans.end_date
		LIMIT 1
	)
WHERE deleted = 0 AND end_date >= date('now')
	AND (SELECT COUNT(*) FROM trip_participants p WHERE p.trip_id = trip_plans.id AND p.transport_mode NOT IN ('abgemeldet', 'enthalten')) >= 3;
--> statement-breakpoint
UPDATE trip_plans SET vote_deadline = datetime('now', '+7 days')
WHERE deleted = 0 AND end_date >= date('now') AND date_locked_at IS NULL;
