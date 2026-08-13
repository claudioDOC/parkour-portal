CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`actor_user_id` integer,
	`actor_name` text,
	`title` text NOT NULL,
	`body` text,
	`url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_events_created_idx` ON `activity_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE `activity_seen` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`last_seen_event_id` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trip_participants` ADD `decided_at` text;
