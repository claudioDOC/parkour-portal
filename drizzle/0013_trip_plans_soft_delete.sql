ALTER TABLE `trip_plans` ADD COLUMN `deleted` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `trip_plans` ADD COLUMN `deleted_at` text;
