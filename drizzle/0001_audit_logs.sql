CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` integer,
	`actor_username` text,
	`target_user_id` integer,
	`detail_json` text,
	`ip` text
);
