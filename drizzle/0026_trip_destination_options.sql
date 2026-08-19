-- Ziel-Abstimmung für Trips: Bisher diente `trip_destinations` allein den
-- Ablauf-Vorschlägen. Mit `kind` trägt dieselbe Tabelle beides — Ablauf
-- ('plan') und Zielort ('ziel') — und jede Person hat je Art eine Stimme.
ALTER TABLE trip_destinations ADD COLUMN kind TEXT NOT NULL DEFAULT 'plan';
--> statement-breakpoint
ALTER TABLE trip_destinations ADD COLUMN latitude REAL;
--> statement-breakpoint
ALTER TABLE trip_destinations ADD COLUMN longitude REAL;
--> statement-breakpoint
ALTER TABLE trip_destination_votes ADD COLUMN kind TEXT NOT NULL DEFAULT 'plan';
--> statement-breakpoint
DROP INDEX IF EXISTS trip_destination_votes_trip_user;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS trip_destination_votes_trip_user_kind ON trip_destination_votes (trip_id, user_id, kind);
