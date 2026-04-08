CREATE TABLE `spot_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spot_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`spot_id`) REFERENCES `spots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `spot_challenge_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `spot_challenges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spot_challenge_completion_unique` ON `spot_challenge_completions` (`challenge_id`,`user_id`);
