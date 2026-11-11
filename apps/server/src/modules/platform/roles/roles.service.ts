import { Inject, Injectable } from "@nestjs/common";
import {
  type DataScopeOption,
  dataScopeSchema,
  type FeatureGrant,
  grantSchema,
} from "@smart-sport/contracts";
import { type FeatureGrantEntry, resolveRoleGrants } from "@smart-sport/domain";
import { RolesRepository } from "./roles.repository.js";

function rowGrant(row: {
  level: string;
  actions: string[] | null;
}): FeatureGrant {
  return grantSchema.parse(
    row.level === "custom"
      ? { level: "custom", actions: row.actions ?? [] }
      : { level: row.level },
  );
}

@Injectable()
export class RolesService {
  constructor(
    @Inject(RolesRepository) private readonly repository: RolesRepository,
  ) {}

  /** 加载身份角色的最终档位；自定义角色未调整模块时跟随基础角色。 */
  async resolve(
    roleIds: string[],
  ): Promise<
    (FeatureGrantEntry & { roleId: string; scope: DataScopeOption })[]
  > {
    const assignedRoles = await this.repository.findRoles(roleIds);
    const baseIds = assignedRoles.flatMap((role) =>
      role.baseRoleId ? [role.baseRoleId] : [],
    );
    const bases = await this.repository.findRoles(baseIds);
    const validBases = new Map(
      bases
        .filter((role) => role.kind === "preset")
        .map((role) => [role.id, role]),
    );
    const allRoleIds = [...new Set([...roleIds, ...baseIds])];
    const grants = await this.repository.grants(allRoleIds);
    const byRole = new Map<string, FeatureGrantEntry[]>();
    for (const row of grants) {
      const entries = byRole.get(row.roleId) ?? [];
      entries.push({
        app: row.appCode,
        feature: row.featureCode,
        grant: rowGrant(row),
      });
      byRole.set(row.roleId, entries);
    }
    return assignedRoles.flatMap((role) => {
      const base = role.baseRoleId
        ? validBases.get(role.baseRoleId)
        : undefined;
      if (
        role.kind === "custom" &&
        (!base || base.identityType !== role.identityType)
      )
        return [];
      const entries = base
        ? resolveRoleGrants(
            byRole.get(base.id) ?? [],
            byRole.get(role.id) ?? [],
          )
        : (byRole.get(role.id) ?? []);
      return entries.map((entry) => ({
        ...entry,
        roleId: role.id,
        scope: dataScopeSchema.parse(role.dataScope),
      }));
    });
  }
}
