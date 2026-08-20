-- Mehr Kontext je Meldung: ohne Build-Nummer, Android-Version und Gerät
-- liess sich nie sagen, warum etwas nur bei einer Person auftritt.
ALTER TABLE client_logs ADD COLUMN app_build TEXT;
--> statement-breakpoint
ALTER TABLE client_logs ADD COLUMN os TEXT;
--> statement-breakpoint
ALTER TABLE client_logs ADD COLUMN os_version TEXT;
--> statement-breakpoint
ALTER TABLE client_logs ADD COLUMN model TEXT;
--> statement-breakpoint
ALTER TABLE client_logs ADD COLUMN manufacturer TEXT;
--> statement-breakpoint
ALTER TABLE client_logs ADD COLUMN route TEXT;
--> statement-breakpoint
ALTER TABLE client_logs ADD COLUMN session_id TEXT;
