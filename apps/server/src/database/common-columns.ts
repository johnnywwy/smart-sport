import { integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 } from "uuid";

export function commonColumns() {
  return {
    id: uuid("id").primaryKey().$defaultFn(v7),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(0),
  };
}
