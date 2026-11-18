import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { assertSchoolSchemaName } from "./schema-name.js";
import { createSchoolBusinessTables } from "./school-business-tables.js";

/** 统一构造学校迁移元数据与业务表，供TenantService按学校缓存。 */
export function createSchoolTables(schemaName: string) {
  assertSchoolSchemaName(schemaName);
  const schema = pgSchema(schemaName);
  return Object.freeze({
    ...createSchoolBusinessTables(schema),
    migrations: schema.table("_migrations", {
      version: integer("version").primaryKey(),
      filename: text("filename").notNull(),
      checksum: text("checksum").notNull(),
      appliedAt: timestamp("applied_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    }),
  });
}
