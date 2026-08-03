CREATE TABLE `user_snapshot_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`archived_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_snapshot_versions_user_revision` ON `user_snapshot_versions` (`user_id`,`revision`);--> statement-breakpoint
CREATE TABLE `user_snapshots` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
