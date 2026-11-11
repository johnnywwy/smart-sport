import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  identities,
  identityRoles,
  organizations,
  presetRoleOverrides,
  roleGrants,
  roles,
  users,
} from "../../../schema/public.js";
export type TemplateTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type TemplateSource =
  | Pick<NodePgDatabase, "select" | "selectDistinct">
  | TemplateTransaction;
@Injectable()
export class PresetRolesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(fn: (tx: TemplateTransaction) => Promise<T>) {
    return this.db.transaction(fn);
  }
  list(source: TemplateSource = this.db) {
    return source
      .select({ role: roles, override: presetRoleOverrides })
      .from(roles)
      .leftJoin(presetRoleOverrides, eq(presetRoleOverrides.roleId, roles.id))
      .where(
        and(
          eq(roles.kind, "preset"),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
        ),
      );
  }
  async lock(tx: TemplateTransaction, id: string) {
    // 与目录同步共用事务锁，避免默认值与覆盖值取自不同版本。
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167, 41)`);
    const [row] = await tx
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.id, id),
          eq(roles.kind, "preset"),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
        ),
      )
      .for("update");
    return row;
  }
  dependentRoles(source: TemplateSource, id: string) {
    return source
      .select()
      .from(roles)
      .where(
        and(
          or(eq(roles.id, id), eq(roles.baseRoleId, id)),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
        ),
      );
  }
  grants(source: TemplateSource, ids: string[]) {
    return source
      .select()
      .from(roleGrants)
      .where(inArray(roleGrants.roleId, ids));
  }
  usage(source: TemplateSource, ids: string[], identityType: string) {
    return source
      .selectDistinct({
        identityId: identities.id,
        userId: users.id,
        orgId: organizations.id,
      })
      .from(identityRoles)
      .innerJoin(identities, eq(identities.id, identityRoles.identityId))
      .innerJoin(users, eq(users.id, identities.userId))
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .innerJoin(roles, eq(roles.id, identityRoles.roleId))
      .where(
        and(
          inArray(identityRoles.roleId, ids),
          eq(identities.type, identityType),
          isNull(identities.deletedAt),
          isNull(users.deletedAt),
          isNull(organizations.deletedAt),
          or(eq(roles.kind, "preset"), eq(roles.orgId, identities.orgId)),
        ),
      );
  }
  async persist(
    tx: TemplateTransaction,
    id: string,
    actorId: string,
    version: number,
    override: {
      dataScope: string | null;
      remark: string | null;
      grants: unknown[];
    } | null,
  ) {
    const [updated] = await tx
      .update(roles)
      .set({
        version: sql`${roles.version}+1`,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(and(eq(roles.id, id), eq(roles.version, version)))
      .returning();
    if (!updated) return undefined;
    if (override)
      await tx
        .insert(presetRoleOverrides)
        .values({
          roleId: id,
          ...override,
          version: updated.version,
          updatedBy: actorId,
        })
        .onConflictDoUpdate({
          target: presetRoleOverrides.roleId,
          set: {
            ...override,
            version: updated.version,
            updatedBy: actorId,
            updatedAt: new Date(),
          },
        });
    else
      await tx
        .delete(presetRoleOverrides)
        .where(eq(presetRoleOverrides.roleId, id));
    return updated;
  }
  audit(tx: TemplateTransaction, value: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(value);
  }
}
