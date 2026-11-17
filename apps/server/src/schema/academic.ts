import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";

export const academicYears = pgTable(
  "academic_years",
  {
    ...commonColumns(),
    name: varchar("name", { length: 32 }).notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    status: varchar("status", { length: 8 }).notNull().default("draft"),
  },
  (t) => [
    uniqueIndex("academic_years_start_active_unique")
      .on(t.startDate)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("academic_years_current_active_unique")
      .on(t.isCurrent)
      .where(sql`${t.isCurrent} AND ${t.deletedAt} IS NULL`),
    check("academic_years_dates_check", sql`${t.startDate} <= ${t.endDate}`),
    check(
      "academic_years_status_check",
      sql`${t.status} IN ('draft','current','closed') AND ${t.isCurrent} = (${t.status} = 'current')`,
    ),
    check("academic_years_version_check", sql`${t.version} >= 0`),
  ],
);
export const semesters = pgTable(
  "semesters",
  {
    ...commonColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    term: smallint("term").notNull(),
    name: varchar("name", { length: 32 }).notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (t) => [
    uniqueIndex("semesters_year_term_active_unique")
      .on(t.academicYearId, t.term)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex("semesters_current_active_unique")
      .on(t.isCurrent)
      .where(sql`${t.isCurrent} AND ${t.deletedAt} IS NULL`),
    check("semesters_term_check", sql`${t.term} IN (1,2)`),
    check("semesters_dates_check", sql`${t.startDate} <= ${t.endDate}`),
    check("semesters_version_check", sql`${t.version} >= 0`),
  ],
);
