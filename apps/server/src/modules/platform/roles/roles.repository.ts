import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { roleGrants, roles } from "../../../schema/public.js";

@Injectable()
export class RolesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async findRoles(ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .select()
      .from(roles)
      .where(
        and(
          inArray(roles.id, ids),
          isNull(roles.deletedAt),
          eq(roles.status, 1),
        ),
      );
  }

  grants(roleIds: string[]) {
    if (!roleIds.length) return [];
    return this.db
      .select()
      .from(roleGrants)
      .where(inArray(roleGrants.roleId, roleIds));
  }

  async findPresetByCode(code: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.kind, "preset"),
          eq(roles.code, code),
          isNull(roles.deletedAt),
        ),
      )
      .limit(1);
    return role;
  }
}
