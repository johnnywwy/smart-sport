import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { Repository } from "../../../database/repository.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import {
  academicYears,
  type auditLogs,
  semesters,
} from "../../../schema/public.js";

export type AcademicTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type AcademicYearRow = typeof academicYears.$inferSelect;
export type SemesterRow = typeof semesters.$inferSelect;

@Injectable()
export class AcademicRepository extends Repository<typeof academicYears> {
  constructor(@Inject(DRIZZLE) db: NodePgDatabase) {
    super(db, academicYears);
    this.database = db;
  }
  private readonly database: NodePgDatabase;
  transaction<T>(callback: (tx: AcademicTransaction) => Promise<T>) {
    return this.database.transaction(callback);
  }
  async lockPolicy(tx: AcademicTransaction) {
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  async lockCalendar(tx: AcademicTransaction) {
    // 所有日历写入共用事务锁，包括两个不同目标的切换和空库首次切换。
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167,80)`);
  }
  list(tx: Pick<AcademicTransaction, "select"> = this.database) {
    return tx
      .select({ year: academicYears, semester: semesters })
      .from(academicYears)
      .leftJoin(
        semesters,
        and(
          eq(semesters.academicYearId, academicYears.id),
          isNull(semesters.deletedAt),
        ),
      )
      .where(isNull(academicYears.deletedAt))
      .orderBy(desc(academicYears.startDate), asc(semesters.term));
  }
  async insertYear(
    tx: AcademicTransaction,
    input: typeof academicYears.$inferInsert,
  ) {
    const [row] = await tx.insert(academicYears).values(input).returning();
    if (!row) throw new Error("创建学年未返回记录");
    return row;
  }
  insertSemesters(
    tx: AcademicTransaction,
    input: (typeof semesters.$inferInsert)[],
  ) {
    return tx.insert(semesters).values(input).returning();
  }
  updateYear(
    tx: AcademicTransaction,
    row: AcademicYearRow,
    actorId: string,
    patch: { isCurrent: boolean; status: string },
  ) {
    return new Repository(tx, academicYears).updateWithVersion(
      { id: row.id, version: row.version, actorId, scope: sql`true` },
      patch,
    );
  }
  updateSemester(
    tx: AcademicTransaction,
    row: SemesterRow,
    actorId: string,
    patch: Partial<Pick<SemesterRow, "startDate" | "endDate" | "isCurrent">>,
  ) {
    return new Repository(tx, semesters).updateWithVersion(
      { id: row.id, version: row.version, actorId, scope: sql`true` },
      patch,
    );
  }
  audit(tx: AcademicTransaction, input: typeof auditLogs.$inferInsert) {
    return auditWriter.write(tx, input);
  }
}
