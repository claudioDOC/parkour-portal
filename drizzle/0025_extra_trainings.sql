-- Zusatztrainings: spontane Termine neben Dienstag/Donnerstag. Sie liegen
-- in derselben Tabelle, damit An-/Abmeldung, Spot-Voting, Gäste und der
-- Kalender ohne Sonderfälle funktionieren.
ALTER TABLE training_sessions ADD COLUMN is_extra INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE training_sessions ADD COLUMN created_by INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE training_sessions ADD COLUMN note TEXT;
