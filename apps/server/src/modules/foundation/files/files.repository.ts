import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { files } from "../../../schema/public.js";
export type FileRow = typeof files.$inferSelect;
@Injectable()
export class FilesRepository {
  constructor(@Inject(DRIZZLE) private readonly database: NodePgDatabase) {}
  async create(input: typeof files.$inferInsert) {
    const [row] = await this.database.insert(files).values(input).returning();
    if (!row) throw new Error("文件记录创建失败");
    return row;
  }
  async owned(
    id: string,
    identityId: string,
    orgId: string,
    schoolId: string | null,
  ) {
    const [row] = await this.database
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.identityId, identityId),
          eq(files.orgId, orgId),
          schoolId ? eq(files.schoolId, schoolId) : isNull(files.schoolId),
          isNull(files.deletedAt),
          gt(files.expiresAt, sql`clock_timestamp()`),
        ),
      );
    return row;
  }
  async abandon(id: string, identityId: string) {
    await this.database
      .update(files)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: identityId,
        version: sql`${files.version}+1`,
      })
      .where(
        and(
          eq(files.id, id),
          eq(files.identityId, identityId),
          isNull(files.deletedAt),
        ),
      );
  }
}
