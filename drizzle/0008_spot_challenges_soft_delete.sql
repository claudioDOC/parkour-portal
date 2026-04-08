ALTER TABLE `spot_challenges` ADD COLUMN `deleted` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `spot_challenges` ADD COLUMN `deleted_at` text;
