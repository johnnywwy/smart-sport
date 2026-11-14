import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  presetRoleOverrides,
  roleGrants,
  roles,
} from "../../../schema/public.js";

export type RoleReadDatabase = Pick<NodePgDatabase, "select">;

@Injectable()
export class RolesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async findRoles(ids: string[], db: RoleReadDatabase = this.db) {
    if (!ids.length) return [];
    return db
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

  grants(roleIds: string[], db: RoleReadDatabase = this.db) {
    if (!roleIds.length) return [];
    return db
      .select()
      .from(roleGrants)
      .where(inArray(roleGrants.roleId, roleIds));
  }

  templateOverrides(roleIds: string[], db: RoleReadDatabase = this.db) {
    if (!roleIds.length) return [];
    return db
      .select()
      .from(presetRoleOverrides)
      .where(inArray(presetRoleOverrides.roleId, roleIds));
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
