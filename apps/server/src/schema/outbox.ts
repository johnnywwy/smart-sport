import type { OutboxEventInput, OutboxTopic } from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";
export const outboxEvents = pgTable(
  "outbox_events",
  {
    ...commonColumns(),
    topic: text("topic").$type<OutboxTopic>().notNull(),
    schoolId: uuid("school_id"),
    payload: jsonb("payload").$type<OutboxEventInput["payload"]>().notNull(),
    status: text("status")
      .$type<"pending" | "published" | "failed">()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", {
      withTimezone: true,
    }).defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error").$type<"delivery_failed">(),
  },
  (t) => [
    check("outbox_events_version_check", sql`${t.version} >= 0`),
    check(
      "outbox_events_topic_check",
      sql`${t.topic} IN ('school.student.created','school.student.status_changed','subscription.changed','scope.changed')`,
    ),
    check(
      "outbox_events_payload_check",
      sql`jsonb_typeof(${t.payload})='object'`,
    ),
    check(
      "outbox_events_status_check",
      sql`${t.status} IN ('pending','published','failed')`,
    ),
    check("outbox_events_attempts_check", sql`${t.attempts} BETWEEN 0 AND 11`),
    check(
      "outbox_events_error_check",
      sql`${t.lastError} IS NULL OR ${t.lastError}='delivery_failed'`,
    ),
    check(
      "outbox_events_school_check",
      sql`${t.topic} NOT LIKE 'school.%' OR ${t.schoolId} IS NOT NULL`,
    ),
    check(
      "outbox_events_lifecycle_check",
      sql`(${t.status}='published')=(${t.publishedAt} IS NOT NULL) AND (${t.status}='pending')=(${t.nextRetryAt} IS NOT NULL) AND (${t.status}<>'pending' OR ${t.attempts}<11) AND (${t.status}<>'failed' OR ${t.attempts}=11)`,
    ),
    index("outbox_events_due_idx")
      .on(t.nextRetryAt, t.id)
      .where(sql`${t.deletedAt} IS NULL AND ${t.status}='pending'`),
    index("outbox_events_failed_idx")
      .on(t.id)
      .where(sql`${t.deletedAt} IS NULL AND ${t.status}='failed'`),
  ],
);
export const outboxConsumptions = pgTable(
  "outbox_consumptions",
  {
    sourceDatasource: text("source_datasource").notNull(),
    eventId: uuid("event_id").notNull(),
    consumer: text("consumer").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceDatasource, t.eventId, t.consumer] }),
    check(
      "outbox_consumptions_source_check",
      sql`${t.sourceDatasource} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      "outbox_consumptions_consumer_check",
      sql`${t.consumer} ~ '^[a-z][a-z0-9._-]*$' AND length(${t.consumer})<=100`,
    ),
  ],
);
