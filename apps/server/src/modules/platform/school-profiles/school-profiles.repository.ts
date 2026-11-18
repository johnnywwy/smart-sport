import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import {
  type auditLogs,
  organizations,
  regions,
  schoolProfiles,
} from "../../../schema/public.js";

export type SchoolProfileTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type SchoolProfileRow = typeof schoolProfiles.$inferSelect;
@Injectable()
export class SchoolProfilesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(callback: (tx: SchoolProfileTransaction) => Promise<T>) {
    return this.db.transaction(callback);
  }
  /** 与权限/范围变更触发器共用提交屏障；先取锁，再读权限和目标。 */
  async lockPolicy(tx: SchoolProfileTransaction, write: boolean) {
    return tx.execute(
      write
        ? sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR UPDATE`
        : sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  async school(tx: SchoolProfileTransaction, id: string) {
    return (
      await tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .innerJoin(regions, eq(regions.code, organizations.regionCode))
        .where(
          and(
            eq(organizations.id, id),
            eq(organizations.type, "school"),
            eq(organizations.status, 1),
            isNull(organizations.deletedAt),
            eq(regions.status, 1),
          ),
        )
    )[0];
  }
  async find(tx: SchoolProfileTransaction, id: string, lock = false) {
    const query = tx
      .select()
      .from(schoolProfiles)
      .where(
        and(eq(schoolProfiles.schoolId, id), isNull(schoolProfiles.deletedAt)),
      );
    return (await (lock ? query.for("update") : query))[0];
  }
  async insert(
    tx: SchoolProfileTransaction,
    input: typeof schoolProfiles.$inferInsert,
  ) {
    return (await tx.insert(schoolProfiles).values(input).returning())[0];
  }
  async update(
    tx: SchoolProfileTransaction,
    id: string,
    version: number,
    changes: Partial<typeof schoolProfiles.$inferInsert>,
  ) {
    return (
      await tx
        .update(schoolProfiles)
        .set({
          ...changes,
          updatedAt: new Date(),
          version: sql`${schoolProfiles.version}+1`,
        })
        .where(
          and(
            eq(schoolProfiles.schoolId, id),
            eq(schoolProfiles.version, version),
            isNull(schoolProfiles.deletedAt),
          ),
        )
        .returning()
    )[0];
  }
  audit(tx: SchoolProfileTransaction, input: typeof auditLogs.$inferInsert) {
    return auditWriter.write(tx, input);
  }
}
