ALTER TABLE `trip_participants` ADD COLUMN `transport_mode` text DEFAULT 'mitfahrt' NOT NULL;
--> statement-breakpoint
ALTER TABLE `trip_participants` ADD COLUMN `vehicle_from` text;
