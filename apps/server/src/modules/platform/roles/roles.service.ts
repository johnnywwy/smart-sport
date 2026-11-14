import { Inject, Injectable } from "@nestjs/common";
import {
  appDefinitions,
  type DataScopeOption,
  dataScopeSchema,
  type FeatureGrant,
  grantSchema,
  presetFeatureGrantSchema,
} from "@smart-sport/contracts";
import {
  type FeatureGrantEntry,
  mergePermissions,
  resolveRoleGrants,
} from "@smart-sport/domain";
import { type RoleReadDatabase, RolesRepository } from "./roles.repository.js";

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

  /** 权限检查和写事务共用最终档位展开逻辑，事务内不读取外部缓存。 */
  async permissions(roleIds: string[], db?: RoleReadDatabase) {
    const grants = await this.resolve(roleIds, db);
    const definitions = appDefinitions.flatMap((app) =>
      Object.entries(app.features).map(([feature, definition]) => ({
        app: app.code,
        feature,
        actions: [...definition.actions],
      })),
    );
    return mergePermissions(
      grants.flatMap((entry) => {
        const feature = definitions.find(
          (definition) =>
            definition.app === entry.app &&
            definition.feature === entry.feature,
        );
        return feature
          ? [{ feature, grant: entry.grant, scope: entry.scope }]
          : [];
      }),
    );
  }

  /** 加载身份角色的最终档位；自定义角色未调整模块时跟随基础角色。 */
  async resolve(
    roleIds: string[],
    db?: RoleReadDatabase,
  ): Promise<
    (FeatureGrantEntry & { roleId: string; scope: DataScopeOption })[]
  > {
    const assignedRoles = await this.repository.findRoles(roleIds, db);
    const baseIds = assignedRoles.flatMap((role) =>
      role.baseRoleId ? [role.baseRoleId] : [],
    );
    const bases = await this.repository.findRoles(baseIds, db);
    const validBases = new Map(
      bases
        .filter((role) => role.kind === "preset")
        .map((role) => [role.id, role]),
    );
    const allRoleIds = [...new Set([...roleIds, ...baseIds])];
    const grants = await this.repository.grants(allRoleIds, db);
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
    const templates = await this.repository.templateOverrides(allRoleIds, db);
    const preset = new Map(
      [...assignedRoles, ...bases]
        .filter((r) => r.kind === "preset")
        .map((r) => [r.id, r]),
    );
    for (const template of templates) {
      if (
        !preset.has(template.roleId) ||
        preset.get(template.roleId)?.code === "company-super-admin"
      )
        continue;
      const overrides = presetFeatureGrantSchema.array().parse(template.grants);
      byRole.set(
        template.roleId,
        resolveRoleGrants(byRole.get(template.roleId) ?? [], overrides),
      );
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
        scope: dataScopeSchema.parse(
          role.kind === "preset" && role.code !== "company-super-admin"
            ? (templates.find((t) => t.roleId === role.id)?.dataScope ??
                role.dataScope)
            : role.dataScope,
        ),
      }));
    });
  }
}
