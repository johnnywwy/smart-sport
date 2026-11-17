import type { SystemParamKey } from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";
export const systemParams = pgTable(
  "sys_params",
  {
    ...commonColumns(),
    key: varchar("key", { length: 64 }).$type<SystemParamKey>().notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    value: jsonb("value").$type<number>().notNull(),
    valueSchema: jsonb("value_schema")
      .$type<{ type: "integer"; minimum: number; maximum: number }>()
      .notNull(),
    remark: text("remark").notNull().default(""),
  },
  (t) => [
    check("sys_params_version_check", sql`${t.version} >= 0`),
    check(
      "sys_params_value_check",
      sql`jsonb_typeof(${t.value}) = 'number' AND
      CASE WHEN ${t.value}::text ~ '^[0-9]+$' THEN
        CASE ${t.key}
          WHEN 'password.min_length' THEN (${t.value}::text)::numeric BETWEEN 8 AND 64
          WHEN 'password.expire_days' THEN (${t.value}::text)::numeric BETWEEN 0 AND 365
          WHEN 'login.lock_threshold' THEN (${t.value}::text)::numeric BETWEEN 5 AND 100
          WHEN 'subscription.trial_days' THEN (${t.value}::text)::numeric BETWEEN 1 AND 365
          WHEN 'subscription.grace_days' THEN (${t.value}::text)::numeric BETWEEN 0 AND 365
          WHEN 'recycle.retention_days' THEN (${t.value}::text)::numeric BETWEEN 1 AND 365
          WHEN 'import.undo_hours' THEN (${t.value}::text)::numeric BETWEEN 1 AND 168
          WHEN 'rollover.undo_days' THEN (${t.value}::text)::numeric BETWEEN 1 AND 30
          ELSE false END
      ELSE false END`,
    ),
    uniqueIndex("sys_params_key_active_unique")
      .on(t.key)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);
