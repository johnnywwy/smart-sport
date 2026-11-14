import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  identities,
  identityRoles,
  organizations,
  roles,
  users,
} from "../../../schema/public.js";

export type AdministratorTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];

@Injectable()
export class AdministratorRepository {
  lock(tx: AdministratorTransaction) {
    // 与模板、角色写入使用同一事务锁；成员写入也须先取锁，再锁业务行。
    return tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167, 41)`);
  }

  affectedOrganizations(tx: AdministratorTransaction, roleId: string) {
    return tx
      .selectDistinct({ id: identities.orgId })
      .from(identities)
      .innerJoin(identityRoles, eq(identityRoles.identityId, identities.id))
      .innerJoin(roles, eq(roles.id, identityRoles.roleId))
      .where(or(eq(roles.id, roleId), eq(roles.baseRoleId, roleId)));
  }

  assignments(tx: AdministratorTransaction, orgIds: string[]) {
    if (!orgIds.length) return [];
    return tx
      .select({
        identityId: identities.id,
        orgId: identities.orgId,
        roleId: roles.id,
      })
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .innerJoin(identityRoles, eq(identityRoles.identityId, identities.id))
      .innerJoin(roles, eq(roles.id, identityRoles.roleId))
      .where(
        and(
          inArray(identities.orgId, orgIds),
          eq(identities.status, 1),
          isNull(identities.deletedAt),
          eq(users.status, 1),
          isNull(users.deletedAt),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
          eq(identities.type, organizations.type),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
          eq(roles.identityType, identities.type),
          or(
            and(eq(roles.kind, "preset"), isNull(roles.orgId)),
            and(eq(roles.kind, "custom"), eq(roles.orgId, identities.orgId)),
          ),
        ),
      );
  }
}
