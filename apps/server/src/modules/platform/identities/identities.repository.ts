import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import {
  identities,
  identityRoles,
  organizations,
  roles,
  userSessions,
  users,
} from "../../../schema/public.js";

export type IdentitiesTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];

@Injectable()
export class IdentitiesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  transaction<T>(callback: (tx: IdentitiesTransaction) => Promise<T>) {
    return this.db.transaction(callback);
  }

  async findSession(
    tx: IdentitiesTransaction,
    input: { userId: string; sessionId: string },
    lock = false,
  ) {
    const query = tx
      .select({
        session: userSessions,
        user: users,
      })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .where(
        and(
          eq(userSessions.id, input.sessionId),
          eq(userSessions.userId, input.userId),
        ),
      )
      .limit(1);
    const rows = lock ? await query.for("update") : await query;
    return rows[0];
  }

  listRows(tx: IdentitiesTransaction, userId: string) {
    return tx
      .select({
        id: identities.id,
        userId: identities.userId,
        type: identities.type,
        orgId: identities.orgId,
        departmentId: identities.departmentId,
        title: identities.title,
        status: identities.status,
        sort: identities.sort,
        orgType: organizations.type,
        orgName: organizations.name,
        orgStatus: organizations.status,
        orgDeletedAt: organizations.deletedAt,
      })
      .from(identities)
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .where(and(eq(identities.userId, userId), isNull(identities.deletedAt)))
      .orderBy(asc(identities.sort), asc(organizations.name));
  }

  async roleMap(tx: IdentitiesTransaction, identityIds: string[]) {
    if (!identityIds.length) return new Map<string, string[]>();
    const rows = await tx
      .select({
        identityId: identityRoles.identityId,
        roleId: identityRoles.roleId,
      })
      .from(identityRoles)
      .innerJoin(identities, eq(identities.id, identityRoles.identityId))
      .innerJoin(roles, eq(roles.id, identityRoles.roleId))
      .where(
        and(
          inArray(identityRoles.identityId, identityIds),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
          eq(roles.identityType, identities.type),
          or(eq(roles.kind, "preset"), eq(roles.orgId, identities.orgId)),
        ),
      );
    const result = new Map<string, string[]>();
    for (const row of rows) {
      const roles = result.get(row.identityId) ?? [];
      roles.push(row.roleId);
      result.set(row.identityId, roles);
    }
    return result;
  }

  async findOwnedIdentity(
    tx: IdentitiesTransaction,
    userId: string,
    identityId: string,
  ) {
    const [row] = await tx
      .select({
        id: identities.id,
        userId: identities.userId,
        type: identities.type,
        orgId: identities.orgId,
        departmentId: identities.departmentId,
        title: identities.title,
        status: identities.status,
        sort: identities.sort,
        deletedAt: identities.deletedAt,
        orgType: organizations.type,
        orgName: organizations.name,
        orgStatus: organizations.status,
        orgDeletedAt: organizations.deletedAt,
      })
      .from(identities)
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .where(and(eq(identities.id, identityId), eq(identities.userId, userId)))
      .limit(1);
    return row;
  }

  async selectIdentity(
    tx: IdentitiesTransaction,
    input: {
      userId: string;
      sessionId: string;
      identityId: string;
      date: Date;
      orgId: string;
      metadata: { traceId: string; ip: string; userAgent: string };
    },
  ) {
    await tx
      .update(userSessions)
      .set({
        identityId: input.identityId,
        lastActiveAt: input.date,
        updatedAt: input.date,
        version: sql`${userSessions.version} + 1`,
      })
      .where(eq(userSessions.id, input.sessionId));
    await tx
      .update(users)
      .set({
        lastIdentityId: input.identityId,
        updatedAt: input.date,
        version: sql`${users.version} + 1`,
      })
      .where(eq(users.id, input.userId));
    await auditWriter.write(tx, {
      userId: input.userId,
      identityId: input.identityId,
      orgId: input.orgId,
      action: "identity.select",
      targetType: "identity",
      targetId: input.identityId,
      changes: { selected: true },
      ip: input.metadata.ip,
      userAgent: input.metadata.userAgent,
      traceId: input.metadata.traceId,
      createdAt: input.date,
    });
  }

  revokeSession(sessionId: string) {
    return this.db
      .update(userSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  }
}
