import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  departments,
  identities,
  organizations,
  roles,
} from "../../../schema/public.js";

export type DepartmentTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type DepartmentRow = typeof departments.$inferSelect;

@Injectable()
export class DepartmentsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(fn: (tx: DepartmentTransaction) => Promise<T>) {
    return this.db.transaction(fn);
  }
  async organization(tx: DepartmentTransaction, orgId: string, lock = false) {
    const query = tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
      .limit(1);
    return (lock ? await query.for("update") : await query)[0];
  }
  async isSuperAdmin(tx: DepartmentTransaction, roleIds: string[]) {
    if (!roleIds.length) return false;
    const rows = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          inArray(roles.id, roleIds),
          eq(roles.code, "company-super-admin"),
          eq(roles.kind, "preset"),
          isNull(roles.orgId),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
        ),
      );
    return rows.length > 0;
  }
  list(tx: DepartmentTransaction, orgId: string) {
    return tx
      .select()
      .from(departments)
      .where(and(eq(departments.orgId, orgId), isNull(departments.deletedAt)))
      .orderBy(
        asc(departments.sort),
        asc(departments.name),
        asc(departments.id),
      );
  }
  async find(
    tx: DepartmentTransaction,
    orgId: string,
    id: string,
    lock = false,
  ) {
    const query = tx
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.id, id),
          eq(departments.orgId, orgId),
          isNull(departments.deletedAt),
        ),
      )
      .limit(1);
    return (lock ? await query.for("update") : await query)[0];
  }
  async duplicate(
    tx: DepartmentTransaction,
    orgId: string,
    parentId: string | null,
    name: string,
    exceptId?: string,
  ) {
    const rows = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.orgId, orgId),
          parentId
            ? eq(departments.parentId, parentId)
            : isNull(departments.parentId),
          eq(departments.name, name),
          isNull(departments.deletedAt),
          exceptId ? sql`${departments.id} <> ${exceptId}` : undefined,
        ),
      );
    return rows.length > 0;
  }
  async hasChildren(tx: DepartmentTransaction, orgId: string, id: string) {
    const rows = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.orgId, orgId),
          eq(departments.parentId, id),
          isNull(departments.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async hasMembers(tx: DepartmentTransaction, id: string) {
    const rows = await tx
      .select({ id: identities.id })
      .from(identities)
      .where(and(eq(identities.departmentId, id), isNull(identities.deletedAt)))
      .limit(1);
    return rows.length > 0;
  }
  async insert(
    tx: DepartmentTransaction,
    value: typeof departments.$inferInsert,
  ) {
    const [row] = await tx.insert(departments).values(value).returning();
    if (!row) throw new Error("部门创建后缺失");
    return row;
  }
  async update(
    tx: DepartmentTransaction,
    orgId: string,
    id: string,
    version: number,
    actorId: string,
    changes: Partial<
      Pick<DepartmentRow, "name" | "parentId" | "path" | "sort" | "deletedAt">
    >,
  ) {
    return (
      await tx
        .update(departments)
        .set({
          ...changes,
          version: sql`${departments.version}+1`,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(departments.orgId, orgId),
            eq(departments.id, id),
            eq(departments.version, version),
            isNull(departments.deletedAt),
          ),
        )
        .returning()
    )[0];
  }
  moveDescendants(
    tx: DepartmentTransaction,
    orgId: string,
    oldPath: string,
    newPath: string,
    actorId: string,
  ) {
    return tx
      .update(departments)
      .set({
        path: sql`${newPath} || substring(${departments.path} from ${oldPath.length + 1}::integer)`,
        version: sql`${departments.version}+1`,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(
        and(
          eq(departments.orgId, orgId),
          isNull(departments.deletedAt),
          sql`${departments.path} LIKE ${`${oldPath}.%`}`,
        ),
      )
      .returning({ id: departments.id });
  }
  audit(tx: DepartmentTransaction, input: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(input);
  }
}
