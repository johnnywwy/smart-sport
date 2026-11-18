import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../database/common-columns.js";
export const files = pgTable(
  "files",
  {
    ...commonColumns(),
    identityId: uuid("identity_id").notNull(),
    orgId: uuid("org_id").notNull(),
    objectKey: text("object_key").notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    schoolId: uuid("school_id"),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("files_object_key_unique").on(t.objectKey),
    index("files_owner_active_idx")
      .on(t.identityId)
      .where(sql`${t.deletedAt} IS NULL`),
    index("files_expiry_idx").on(t.expiresAt),
    check(
      "files_upload_values",
      sql`${t.size} BETWEEN 1 AND 20971520 AND ${t.purpose} = 'import' AND ${t.sha256} ~ '^[0-9a-f]{64}$' AND ${t.expiresAt} > ${t.createdAt}`,
    ),
  ],
);
