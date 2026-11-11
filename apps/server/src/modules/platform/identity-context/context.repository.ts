import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  identities,
  identityRoles,
  organizations,
  roles,
  users,
} from "../../../schema/public.js";

@Injectable()
export class ContextRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async revision() {
    const result = await this.db.execute(
      sql`SELECT version::text FROM public.identity_context_revision WHERE singleton=true`,
    );
    return String(result.rows[0]?.version ?? "0");
  }

  async identity(identityId: string) {
    const [row] = await this.db
      .select({
        identity: identities,
        organization: organizations,
        user: users,
      })
      .from(identities)
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .innerJoin(users, eq(users.id, identities.userId))
      .where(and(eq(identities.id, identityId), isNull(identities.deletedAt)))
      .limit(1);
    return row;
  }

  roleIds(identityId: string) {
    return this.db
      .select({ id: identityRoles.roleId })
      .from(identityRoles)
      .innerJoin(identities, eq(identities.id, identityRoles.identityId))
      .innerJoin(roles, eq(roles.id, identityRoles.roleId))
      .where(
        and(
          eq(identityRoles.identityId, identityId),
          eq(roles.identityType, identities.type),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
          or(eq(roles.kind, "preset"), eq(roles.orgId, identities.orgId)),
        ),
      );
  }
}
