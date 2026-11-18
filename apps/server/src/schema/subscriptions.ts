import type { SchoolApp, SubscriptionStatus } from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
import { v7 } from "uuid";
import { commonColumns } from "../database/common-columns.js";

export function createSubscriptionTables(refs: {
  school: AnyPgColumn;
  identity: AnyPgColumn;
  application: AnyPgColumn;
}) {
  const schoolSubscriptions = pgTable(
    "school_subscriptions",
    {
      ...commonColumns(),
      schoolId: uuid("school_id")
        .notNull()
        .references(() => refs.school),
      no: text("no").notNull(),
      contractNo: text("contract_no"),
      serviceStart: timestamp("service_start", {
        withTimezone: true,
      }).notNull(),
      serviceEnd: timestamp("service_end", { withTimezone: true }).notNull(),
      graceDays: integer("grace_days").notNull().default(30),
      status: text("status").$type<SubscriptionStatus>().notNull(),
      salesIdentityId: uuid("sales_identity_id").references(
        () => refs.identity,
      ),
    },
    (t) => [
      uniqueIndex("school_subscriptions_school_active_unique")
        .on(t.schoolId)
        .where(sql`${t.deletedAt} IS NULL`),
      uniqueIndex("school_subscriptions_no_active_unique")
        .on(t.no)
        .where(sql`${t.deletedAt} IS NULL`),
      check(
        "school_subscriptions_values",
        sql`${t.version}>=0 AND ${t.graceDays} BETWEEN 0 AND 365 AND ${t.serviceStart}<=${t.serviceEnd} AND ${t.status} IN ('trial','active','grace','suspended') AND (${t.contractNo} IS NULL OR length(btrim(${t.contractNo})) BETWEEN 1 AND 128)`,
      ),
    ],
  );
  const schoolApps = pgTable(
    "school_apps",
    {
      ...commonColumns(),
      schoolId: uuid("school_id")
        .notNull()
        .references(() => refs.school),
      appCode: text("app_code")
        .notNull()
        .references(() => refs.application),
      startDate: timestamp("start_date", { withTimezone: true }).notNull(),
      endDate: timestamp("end_date", { withTimezone: true }).notNull(),
      source: text("source").$type<SchoolApp["source"]>().notNull(),
    },
    (t) => [
      uniqueIndex("school_apps_active_unique")
        .on(t.schoolId, t.appCode)
        .where(sql`${t.deletedAt} IS NULL`),
      check(
        "school_apps_values",
        sql`${t.version}>=0 AND ${t.startDate}<=${t.endDate} AND ${t.source} IN ('contract','trial','gift')`,
      ),
    ],
  );
  const schoolSubscriptionLogs = pgTable(
    "school_subscription_logs",
    {
      id: uuid("id").primaryKey().$defaultFn(v7),
      schoolId: uuid("school_id")
        .notNull()
        .references(() => refs.school),
      subscriptionId: uuid("subscription_id")
        .notNull()
        .references(() => schoolSubscriptions.id),
      action: text("action").$type<"initialize" | "status_changed">().notNull(),
      previousStatus: text("previous_status").$type<SubscriptionStatus>(),
      status: text("status").$type<SubscriptionStatus>().notNull(),
      serviceStart: timestamp("service_start", {
        withTimezone: true,
      }).notNull(),
      serviceEnd: timestamp("service_end", { withTimezone: true }).notNull(),
      graceDays: integer("grace_days").notNull(),
      apps: jsonb("apps").$type<SchoolApp[]>().notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      createdBy: uuid("created_by"),
    },
    (t) => [
      index("school_subscription_logs_school_idx").on(
        t.schoolId,
        t.createdAt,
        t.id,
      ),
    ],
  );

  return { schoolSubscriptions, schoolApps, schoolSubscriptionLogs };
}
