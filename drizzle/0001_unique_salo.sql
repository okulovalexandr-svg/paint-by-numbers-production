CREATE TABLE `production_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`width_mm` integer NOT NULL,
	`height_mm` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`file_key` text,
	`file_name` text,
	`definition_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
