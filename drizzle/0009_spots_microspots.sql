ALTER TABLE `spots` ADD COLUMN `is_micro` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `spots` ADD COLUMN `parent_spot_id` integer;
