ALTER TABLE `users` ADD COLUMN `auto_absent_weekdays` text NOT NULL DEFAULT '[]';

CREATE TABLE `training_session_weekday_override` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `training_session_weekday_override_session_user` ON `training_session_weekday_override` (`session_id`,`user_id`);
