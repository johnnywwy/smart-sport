import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";

export const users = pgTable(
  "users",
  {
    ...commonColumns(),
    username: varchar("username", { length: 64 }).notNull(),
    phone: text("phone"),
    phoneHash: varchar("phone_hash", { length: 64 }),
    email: varchar("email", { length: 128 }),
    realName: varchar("real_name", { length: 64 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    status: smallint("status").notNull().default(1),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastIdentityId: uuid("last_identity_id"),
    tokenVersion: integer("token_version").notNull().default(0),
  },
  (table) => [
    uniqueIndex("users_username_active_unique")
      .on(table.username)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("users_phone_hash_active_unique")
      .on(table.phoneHash)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("users_email_active_unique")
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "users_phone_pair_check",
      sql`(${table.phone} IS NULL) = (${table.phoneHash} IS NULL)`,
    ),
    check(
      "users_phone_hash_format_check",
      sql`${table.phoneHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("users_status_check", sql`${table.status} IN (0, 1)`),
    check("users_failed_attempts_check", sql`${table.failedAttempts} >= 0`),
    check("users_token_version_check", sql`${table.tokenVersion} >= 0`),
    check("users_version_check", sql`${table.version} >= 0`),
  ],
);
