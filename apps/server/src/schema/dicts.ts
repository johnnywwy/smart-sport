import type { DictTypeCode } from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";
export const dictTypes = pgTable(
  "dict_types",
  {
    ...commonColumns(),
    code: varchar("code", { length: 32 })
      .$type<DictTypeCode>()
      .notNull()
      .unique(),
    name: varchar("name", { length: 64 }).notNull(),
    isSystem: boolean("is_system").notNull().default(true),
  },
  (t) => [
    check("dict_types_is_system_check", sql`${t.isSystem}`),
    check("dict_types_version_check", sql`${t.version}>=0`),
    check("dict_types_deleted_at_check", sql`${t.deletedAt} IS NULL`),
  ],
);
export const dictItems = pgTable(
  "dict_items",
  {
    ...commonColumns(),
    typeCode: varchar("type_code", { length: 32 })
      .$type<DictTypeCode>()
      .notNull()
      .references(() => dictTypes.code),
    value: varchar("value", { length: 64 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    description: varchar("description", { length: 500 }).notNull().default(""),
    sort: integer("sort").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    unique("dict_items_value_unique").on(t.typeCode, t.value),
    uniqueIndex("dict_items_label_active_unique")
      .on(t.typeCode, t.label)
      .where(sql`${t.deletedAt} IS NULL`),
    index("dict_items_type_sort_active")
      .on(t.typeCode, t.sort, t.id)
      .where(sql`${t.deletedAt} IS NULL`),
    check("dict_items_label_check", sql`length(trim(${t.label}))>0`),
    check("dict_items_sort_check", sql`${t.sort} BETWEEN 0 AND 999999`),
    check("dict_items_version_check", sql`${t.version}>=0`),
    check(
      "dict_items_system_active",
      sql`NOT ${t.isSystem} OR (${t.enabled} AND ${t.deletedAt} IS NULL)`,
    ),
    check(
      "dict_items_used_active",
      sql`${t.usedAt} IS NULL OR ${t.deletedAt} IS NULL`,
    ),
  ],
);
