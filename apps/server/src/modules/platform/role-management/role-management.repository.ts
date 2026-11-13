import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  presetRoleOverrides,
  roleGrants,
  roles,
} from "../../../schema/public.js";
import { organizationIdentityTypes, type RoleActor } from "./role-policy.js";

export type RoleTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type RoleRow = typeof roles.$inferSelect;

@Injectable()
export class RoleManagementRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  transaction<T>(fn: (tx: RoleTransaction) => Promise<T>) {
    return this.db.transaction(async (tx) => {
      // 与内置模板变更、目录同步串行，差异始终相对同一版基础模板计算。
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167, 41)`);
      return fn(tx);
    });
  }
  list(tx: RoleTransaction, actor: RoleActor) {
    return tx
      .select()
      .from(roles)
      .where(this.visible(actor))
      .orderBy(roles.name);
  }
  async find(tx: RoleTransaction, actor: RoleActor, id: string) {
    const [row] = await tx
      .select()
      .from(roles)
      .where(and(this.visible(actor), eq(roles.id, id)))
      .for("update");
    return row;
  }
  grants(tx: RoleTransaction, id: string) {
    return tx.select().from(roleGrants).where(eq(roleGrants.roleId, id));
  }
  async template(tx: RoleTransaction, id: string) {
    const [row] = await tx
      .select()
      .from(presetRoleOverrides)
      .where(eq(presetRoleOverrides.roleId, id));
    return row;
  }
  async insert(tx: RoleTransaction, value: typeof roles.$inferInsert) {
    const [row] = await tx.insert(roles).values(value).returning();
    if (!row) throw new Error("自定义角色创建后缺失");
    return row;
  }
  async update(
    tx: RoleTransaction,
    row: RoleRow,
    actor: RoleActor,
    dataScope: string,
    version: number,
  ) {
    const [updated] = await tx
      .update(roles)
      .set({
        dataScope,
        version: sql`${roles.version}+1`,
        updatedAt: new Date(),
        updatedBy: actor.identityId,
      })
      .where(
        and(
          this.visible(actor),
          eq(roles.id, row.id),
          eq(roles.kind, "custom"),
          eq(roles.version, version),
        ),
      )
      .returning();
    return updated;
  }
  async replaceGrants(
    tx: RoleTransaction,
    id: string,
    values: Omit<typeof roleGrants.$inferInsert, "roleId">[],
  ) {
    await tx.delete(roleGrants).where(eq(roleGrants.roleId, id));
    if (values.length)
      await tx.insert(roleGrants).values(
        values.map((entry) => ({
          ...entry,
          roleId: id,
        })),
      );
  }
  audit(tx: RoleTransaction, value: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(value);
  }
  private visible(actor: RoleActor) {
    return and(
      eq(roles.status, 1),
      isNull(roles.deletedAt),
      inArray(roles.identityType, organizationIdentityTypes(actor.orgType)),
      or(
        and(eq(roles.kind, "preset"), isNull(roles.orgId)),
        and(eq(roles.kind, "custom"), eq(roles.orgId, actor.orgId)),
      ),
    );
  }
}
