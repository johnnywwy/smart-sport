import type { TaskStatus, TaskSummary, TaskType } from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";
export const tasks = pgTable(
  "tasks",
  {
    ...commonColumns(),
    no: text("no").notNull(),
    type: text("type").$type<TaskType>().notNull(),
    identityId: uuid("identity_id").notNull(),
    orgId: uuid("org_id").notNull(),
    schoolId: uuid("school_id"),
    status: text("status").$type<TaskStatus>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    summary: jsonb("summary").$type<TaskSummary>().notNull().default({}),
    resultFileId: uuid("result_file_id"),
    error: text("error"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tasks_no_active_unique")
      .on(t.no)
      .where(sql`${t.deletedAt} IS NULL`),
    index("tasks_owner_active_idx")
      .on(t.identityId, t.createdAt, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
    index("tasks_owner_status_active_idx")
      .on(t.identityId, t.status)
      .where(sql`${t.deletedAt} IS NULL`),
    check(
      "tasks_values",
      sql`${t.type} IN ('import','export','provision','rollover','tenant_export') AND ${t.status} IN ('queued','running','succeeded','partial','failed','cancelled') AND ${t.progress} BETWEEN 0 AND 100 AND ${t.version} >= 0 AND jsonb_typeof(${t.summary})='object'`,
    ),
    check(
      "tasks_lifecycle",
      sql`(${t.status} IN ('queued','running'))=(${t.finishedAt} IS NULL) AND (${t.status} NOT IN ('succeeded','partial') OR ${t.progress}=100) AND (${t.status}<>'queued' OR (${t.progress}=0 AND ${t.startedAt} IS NULL AND ${t.cancelRequestedAt} IS NULL)) AND (${t.status} NOT IN ('running','succeeded','partial','failed') OR ${t.startedAt} IS NOT NULL) AND (${t.status} NOT IN ('queued','running') OR ${t.progress}<100) AND (${t.status}<>'cancelled' OR ${t.cancelRequestedAt} IS NOT NULL)`,
    ),
  ],
);
