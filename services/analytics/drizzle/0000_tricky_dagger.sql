CREATE TABLE `analytics_events` (
	`request_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`day` text NOT NULL,
	`source` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`route` text NOT NULL,
	`model` text,
	CONSTRAINT "analytics_events_type_check" CHECK("analytics_events"."event_type" IN ('page_view', 'model_select', 'story_start', 'story_complete'))
);
--> statement-breakpoint
CREATE INDEX `analytics_events_day_type_idx` ON `analytics_events` (`day`,`event_type`);--> statement-breakpoint
CREATE INDEX `analytics_events_type_visitor_idx` ON `analytics_events` (`event_type`,`visitor_hash`);--> statement-breakpoint
CREATE INDEX `analytics_events_visitor_time_idx` ON `analytics_events` (`visitor_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_created_at_idx` ON `analytics_events` (`created_at`);