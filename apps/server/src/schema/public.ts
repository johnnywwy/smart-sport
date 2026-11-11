import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
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

// 令牌历史是会话关联记录，只保存不可逆哈希；消费后保留以识别重放。
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => userSessions.id),
    tokenVersion: integer("token_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "refresh_tokens_token_hash_check",
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("refresh_tokens_token_version_check", sql`${t.tokenVersion} >= 0`),
    index("refresh_tokens_session_index").on(t.sessionId),
  ],
);

export const passwordHistory = pgTable(
  "password_history",
  {
    id: uuid("id").primaryKey().$defaultFn(v7),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("password_history_user_index").on(
      table.userId,
      table.createdAt.desc(),
    ),
  ],
);

export const regions = pgTable(
  "regions",
  {
    code: varchar("code", { length: 6 }).primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    level: smallint("level").notNull(),
    parentCode: varchar("parent_code", { length: 6 }),
    path: varchar("path", { length: 20 }).notNull().unique(),
    status: smallint("status").notNull().default(1),
  },
  (table) => [
    check("regions_code_check", sql`${table.code} ~ '^[0-9]{6}$'`),
    check("regions_level_check", sql`${table.level} IN (1,2,3)`),
    check("regions_status_check", sql`${table.status} IN (0,1)`),
  ],
);

export const organizations = pgTable(
  "orgs",
  {
    ...commonColumns(),
    type: varchar("type", { length: 16 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    code: varchar("code", { length: 40 }).notNull().unique(),
    regionCode: varchar("region_code", { length: 6 }).references(
      () => regions.code,
    ),
    status: smallint("status").notNull().default(1),
  },
  (table) => [
    check(
      "orgs_type_check",
      sql`${table.type} IN ('company','bureau','agent','school')`,
    ),
    check("orgs_name_check", sql`length(btrim(${table.name})) >= 2`),
    check("orgs_status_check", sql`${table.status} IN (0,1)`),
    check(
      "orgs_region_rule_check",
      sql`(${table.type} = 'company' AND ${table.regionCode} IS NULL) OR (${table.type} IN ('bureau','school') AND ${table.regionCode} IS NOT NULL) OR ${table.type} = 'agent'`,
    ),
  ],
);

export const identityRoles = pgTable(
  "identity_roles",
  {
    identityId: uuid("identity_id")
      .notNull()
      .references(() => identities.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.identityId, table.roleId] }),
    index("identity_roles_role_index").on(table.roleId),
  ],
);

export const applications = pgTable("apps", {
  code: varchar("code", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 64 }).notNull(),
  identityTypes: text("identity_types").array().notNull(),
  sort: integer("sort").notNull().default(0),
  status: smallint("status").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const features = pgTable(
  "features",
  {
    appCode: varchar("app_code", { length: 32 })
      .notNull()
      .references(() => applications.code),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    actions: text("actions").array().notNull(),
    status: smallint("status").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.appCode, table.code] })],
);

export const menus = pgTable(
  "menus",
  {
    appCode: varchar("app_code", { length: 32 }).notNull(),
    parentKey: varchar("parent_key", { length: 64 }),
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    path: varchar("path", { length: 255 }).notNull(),
    icon: varchar("icon", { length: 64 }),
    featureCode: varchar("feature_code", { length: 32 }).notNull(),
    client: varchar("client", { length: 16 }).notNull().default("admin"),
    sort: integer("sort").notNull().default(0),
    status: smallint("status").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.appCode, table.key] }),
    uniqueIndex("menus_app_path_unique").on(table.appCode, table.path),
    foreignKey({
      columns: [table.appCode, table.featureCode],
      foreignColumns: [features.appCode, features.code],
    }),
    foreignKey({
      columns: [table.appCode, table.parentKey],
      foreignColumns: [table.appCode, table.key],
    }),
  ],
);

export const menuOverrides = pgTable(
  "menu_overrides",
  {
    appCode: varchar("app_code", { length: 32 }).notNull(),
    menuKey: varchar("menu_key", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 64 }),
    sort: integer("sort"),
    icon: varchar("icon", { length: 64 }),
    hidden: boolean("hidden"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.appCode, table.menuKey] }),
    foreignKey({
      columns: [table.appCode, table.menuKey],
      foreignColumns: [menus.appCode, menus.key],
    }).onDelete("cascade"),
  ],
);

export const roles = pgTable(
  "roles",
  {
    ...commonColumns(),
    kind: varchar("kind", { length: 16 }).notNull(),
    baseRoleId: uuid("base_role_id"),
    identityType: varchar("identity_type", { length: 16 }).notNull(),
    orgId: uuid("org_id").references(() => organizations.id),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    dataScope: varchar("data_scope", { length: 32 }).notNull(),
    defaultDepartment: varchar("default_department", { length: 64 }),
    remark: text("remark"),
    status: smallint("status").notNull().default(1),
  },
  (table) => [
    uniqueIndex("roles_preset_code_unique")
      .on(table.code)
      .where(sql`${table.kind}='preset' AND ${table.deletedAt} IS NULL`),
    uniqueIndex("roles_org_code_unique")
      .on(table.orgId, table.code)
      .where(sql`${table.kind}='custom' AND ${table.deletedAt} IS NULL`),
  ],
);

export const roleGrants = pgTable(
  "role_grants",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    appCode: varchar("app_code", { length: 32 }).notNull(),
    featureCode: varchar("feature_code", { length: 32 }).notNull(),
    level: varchar("level", { length: 16 }).notNull(),
    actions: text("actions").array(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.appCode, table.featureCode] }),
    foreignKey({
      columns: [table.appCode, table.featureCode],
      foreignColumns: [features.appCode, features.code],
    }),
  ],
);
