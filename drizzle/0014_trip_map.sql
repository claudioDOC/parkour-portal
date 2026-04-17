ALTER TABLE `trip_plans` ADD `destination_latitude` real;
--> statement-breakpoint
ALTER TABLE `trip_plans` ADD `destination_longitude` real;
--> statement-breakpoint
ALTER TABLE `trip_plans` ADD `destination_label` text;
--> statement-breakpoint
CREATE TABLE `trip_stopovers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`label` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`proposed_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trip_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trip_stopovers_trip_id_idx` ON `trip_stopovers` (`trip_id`);
