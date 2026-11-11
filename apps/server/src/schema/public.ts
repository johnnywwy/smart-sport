import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { v7 } from "uuid";
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

export const userSessions = pgTable(
  "user_sessions",
  {
    ...commonColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    identityId: uuid("identity_id"),
    client: varchar("client", { length: 16 }).notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "user_sessions_client_check",
      sql`${t.client} IN ('admin', 'mobile')`,
    ),
  ],
);

export const identities = pgTable(
  "identities",
  {
    ...commonColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 16 }).notNull(),
    orgId: uuid("org_id").notNull(),
    departmentId: uuid("department_id"),
    refId: uuid("ref_id"),
    title: text("title"),
    status: smallint("status").notNull().default(1),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    uniqueIndex("identities_active_unique")
      .on(t.userId, t.orgId, t.type)
      .where(sql`${t.deletedAt} IS NULL`),
    check("identities_status_check", sql`${t.status} IN (0,1)`),
    check(
      "identities_type_check",
      sql`${t.type} IN ('company','bureau','agent','school','teacher','student','parent')`,
    ),
  ],
);

export const loginLogs = pgTable(
  "login_logs",
  {
    id: uuid("id").primaryKey().$defaultFn(v7),
    userId: uuid("user_id").references(() => users.id),
    usernameInput: text("username_input").notNull(),
    result: varchar("result", { length: 32 }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "login_logs_result_check",
      sql`${t.result} IN ('success','bad_password','locked','disabled','captcha_required')`,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").notNull().$defaultFn(v7),
    userId: uuid("user_id"),
    identityId: uuid("identity_id"),
    orgId: uuid("org_id"),
    schoolId: uuid("school_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    changes: jsonb("changes"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    traceId: uuid("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })],
);
