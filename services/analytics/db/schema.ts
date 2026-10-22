import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const analyticsEvents = sqliteTable('analytics_events', {
  requestId: text('request_id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  day: text('day').notNull(),
  source: text('source').notNull(),
  visitorHash: text('visitor_hash').notNull(),
  eventType: text('event_type', { enum: ['page_view', 'model_select', 'story_start', 'story_complete'] }).notNull(),
  route: text('route').notNull(),
  model: text('model'),
}, (table) => [
  index('analytics_events_day_type_idx').on(table.day, table.eventType),
  index('analytics_events_type_visitor_idx').on(table.eventType, table.visitorHash),
  index('analytics_events_visitor_time_idx').on(table.visitorHash, table.createdAt),
  index('analytics_events_created_at_idx').on(table.createdAt),
  check('analytics_events_type_check', sql`${table.eventType} IN ('page_view', 'model_select', 'story_start', 'story_complete')`),
]);
