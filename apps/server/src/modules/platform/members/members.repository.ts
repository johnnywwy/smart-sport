import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  departments,
  identities,
  identityRoles,
  organizations,
  regions,
  roles,
  userSessions,
  users,
} from "../../../schema/public.js";

export type MemberTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type MemberIdentityRow = typeof identities.$inferSelect;

@Injectable()
export class MembersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(fn: (tx: MemberTransaction) => Promise<T>) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167, 41)`);
      return fn(tx);
    });
  }
  async organization(tx: MemberTransaction, id: string, lock = false) {
    const query = tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
    return (lock ? await query.for("update") : await query)[0];
  }
  async regionPath(tx: MemberTransaction, code: string | null) {
    if (!code) return undefined;
    return (
      await tx
        .select({ path: regions.path })
        .from(regions)
        .where(eq(regions.code, code))
    )[0]?.path;
  }
  async find(tx: MemberTransaction, orgId: string, id: string, lock = false) {
    const query = tx
      .select({
        identity: identities,
        user: users,
        departmentName: departments.name,
      })
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .leftJoin(
        departments,
        and(
          eq(departments.id, identities.departmentId),
          isNull(departments.deletedAt),
        ),
      )
      .where(
        and(
          eq(identities.orgId, orgId),
          eq(identities.id, id),
          inArray(identities.type, [
            "company",
            "bureau",
            "agent",
            "school",
            "teacher",
          ]),
          isNull(identities.deletedAt),
          isNull(users.deletedAt),
        ),
      );
    return (
      lock ? await query.for("update", { of: identities }) : await query
    )[0];
  }
  async department(tx: MemberTransaction, orgId: string, id: string) {
    return (
      await tx
        .select()
        .from(departments)
        .where(
          and(
            eq(departments.orgId, orgId),
            eq(departments.id, id),
            isNull(departments.deletedAt),
          ),
        )
    )[0];
  }
  bindings(tx: MemberTransaction, identityId: string) {
    return tx
      .select({ id: identityRoles.roleId })
      .from(identityRoles)
      .where(eq(identityRoles.identityId, identityId));
  }
  roleRows(tx: MemberTransaction, ids: string[]) {
    if (!ids.length) return [];
    return tx
      .select()
      .from(roles)
      .where(
        and(
          inArray(roles.id, ids),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
        ),
      );
  }
  accountMatches(tx: MemberTransaction, value: string, phoneHash: string) {
    return tx
      .select()
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(
            eq(users.username, value),
            eq(users.email, value),
            eq(users.phoneHash, phoneHash),
          ),
        ),
      )
      .for("update");
  }
  async lockAccount(tx: MemberTransaction, id: string) {
    return (
      await tx.select().from(users).where(eq(users.id, id)).for("update")
    )[0];
  }
  async insertAccount(tx: MemberTransaction, input: typeof users.$inferInsert) {
    return (
      await tx.insert(users).values(input).onConflictDoNothing().returning()
    )[0];
  }
  async insertIdentity(
    tx: MemberTransaction,
    input: typeof identities.$inferInsert,
  ) {
    return (
      await tx
        .insert(identities)
        .values(input)
        .onConflictDoNothing()
        .returning()
    )[0];
  }
  async replaceRoles(tx: MemberTransaction, id: string, roleIds: string[]) {
    await tx.delete(identityRoles).where(eq(identityRoles.identityId, id));
    if (roleIds.length)
      await tx
        .insert(identityRoles)
        .values(roleIds.map((roleId) => ({ identityId: id, roleId })));
  }
  async update(
    tx: MemberTransaction,
    row: MemberIdentityRow,
    version: number,
    actorId: string,
    changes: Partial<
      Pick<MemberIdentityRow, "departmentId" | "title" | "status">
    >,
  ) {
    return (
      await tx
        .update(identities)
        .set({
          ...changes,
          version: sql`${identities.version}+1`,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(identities.id, row.id),
            eq(identities.orgId, row.orgId),
            eq(identities.version, version),
            isNull(identities.deletedAt),
          ),
        )
        .returning()
    )[0];
  }
  audit(tx: MemberTransaction, input: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(input);
  }
  revokeSessions(tx: MemberTransaction, identityId: string) {
    return tx
      .update(userSessions)
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${userSessions.version}+1`,
      })
      .where(
        and(
          eq(userSessions.identityId, identityId),
          isNull(userSessions.revokedAt),
        ),
      );
  }
}
