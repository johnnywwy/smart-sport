import { integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import { assertSchoolSchemaName } from "./schema-name.js";

/** 先提供学校库元数据表，T-090 在同一工厂扩展业务表。 */
export function createSchoolTables(schemaName: string) {
  assertSchoolSchemaName(schemaName);
  const schema = pgSchema(schemaName);
  return Object.freeze({
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
