import type { NumberType } from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  pgTable,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { v7 } from "uuid";
import { commonColumns } from "../database/common-columns.js";

export const numberRules = pgTable(
  "number_rules",
  {
    ...commonColumns(),
    type: varchar("type", { length: 32 }).$type<NumberType>().notNull(),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    digits: smallint("digits").notNull(),
    reset: varchar("reset", { length: 8, enum: ["yearly", "never"] }).notNull(),
    year: smallint("year").notNull(),
    currentValue: bigint("current_value", { mode: "number" })
      .notNull()
      .default(0),
  },
  (t) => [
    uniqueIndex("number_rules_type_active_unique")
      .on(t.type)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("number_rules_prefix_active_unique")
      .on(t.prefix)
      .where(sql`${t.deletedAt} IS NULL`),
    check("number_rules_version_check", sql`${t.version}>=0`),
    check(
      "number_rules_type_check",
      sql`${t.type} IN ('subscription','subscription_request','transfer','task','todo','import')`,
    ),
    check(
      "number_rules_prefix_check",
      sql`${t.prefix} ~ '^[A-Z][A-Z0-9]{0,11}$'`,
    ),
    check("number_rules_digits_check", sql`${t.digits} BETWEEN 1 AND 12`),
    check("number_rules_reset_check", sql`${t.reset} IN ('yearly','never')`),
    check("number_rules_year_check", sql`${t.year} BETWEEN 1 AND 9999`),
    check(
      "number_rules_value_check",
      sql`${t.currentValue} BETWEEN 0 AND 999999999999`,
    ),
  ],
);
export const numberIssues = pgTable(
  "number_issues",
  {
    id: uuid("id").primaryKey().$defaultFn(v7),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => numberRules.id),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    year: smallint("year").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
    no: varchar("no", { length: 30 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.prefix, t.year, t.value),
    check(
      "number_issues_prefix_check",
      sql`${t.prefix} ~ '^[A-Z][A-Z0-9]{0,11}$'`,
    ),
    check("number_issues_year_check", sql`${t.year} BETWEEN 1 AND 9999`),
    check(
      "number_issues_value_check",
      sql`${t.value} BETWEEN 1 AND 999999999999`,
    ),
    check(
      "number_issues_no_check",
      sql`${t.no} ~ '^[A-Z][A-Z0-9]{0,11}-[0-9]{4}-[0-9]{1,12}$'`,
    ),
  ],
);
