import {
  type Action,
  createRoleSchema,
  type DataScopeOption,
  type PermissionCode,
  type RoleDetail,
  type SaveRoleGrants,
  saveRoleGrantsSchema,
} from "@smart-sport/contracts";
import {
  previewActions,
  sameGrant,
} from "../../../shared/components/role-permissions/permission-state";

const scopeRank: Record<DataScopeOption, number> = {
  personal: 0,
  dept: 1,
  dept_and_below: 2,
  all: 3,
};
export type ActorScopes = ReadonlyMap<PermissionCode, DataScopeOption>;

/** 仅为禁用不可授予的控件；最终鉴权仍由服务器执行。每项动作分别取范围。 */
export function actorScopes(roles: readonly RoleDetail[]): ActorScopes {
  const scopes = new Map<PermissionCode, DataScopeOption>();
  for (const role of roles) {
    for (const feature of role.grants) {
      for (const action of previewActions(
        feature.app,
        feature.feature,
        feature.grant,
      )) {
        const code: PermissionCode = `${feature.app}:${feature.feature}:${action}`;
        const previous = scopes.get(code);
        if (!previous || scopeRank[role.dataScope] > scopeRank[previous])
          scopes.set(code, role.dataScope);
      }
    }
  }
  return scopes;
}
export function canGrant(
  scopes: ActorScopes,
  dataScope: DataScopeOption,
  app: string,
  feature: string,
  action: Action,
) {
  const limit = scopes.get(`${app}:${feature}:${action}`);
  return limit !== undefined && scopeRank[dataScope] <= scopeRank[limit];
}
export function grantsFit(
  scopes: ActorScopes,
  values: Pick<SaveRoleGrants, "grants" | "dataScope">,
) {
  if (
    scopeRank[values.dataScope] >
    Math.max(-1, ...[...scopes.values()].map((scope) => scopeRank[scope]))
  )
    return false;
  return values.grants.every((entry) =>
    previewActions(entry.app, entry.feature, entry.grant).every((action) =>
      canGrant(scopes, values.dataScope, entry.app, entry.feature, action),
    ),
  );
}
export function roleValues(role: RoleDetail): SaveRoleGrants {
  return {
    version: role.version,
    dataScope: role.dataScope,
    grants: role.grants.map(({ app, feature, grant }) => ({
      app,
      feature,
      grant,
    })),
  };
}
export function permissionRole(role: RoleDetail) {
  return {
    identityType: role.identityType,
    grants: role.grants.map((entry) => ({
      ...entry,
      defaultGrant: entry.baseGrant,
    })),
  };
}
export function roleChanges(role: RoleDetail, values: SaveRoleGrants) {
  return (
    Number(role.dataScope !== values.dataScope) +
    values.grants.filter((entry) => {
      const saved = role.grants.find(
        (item) => item.app === entry.app && item.feature === entry.feature,
      );
      return !saved || !sameGrant(saved.grant, entry.grant);
    }).length
  );
}
/** 名称和基础角色仍由共享契约校验；数据范围跟随当前选择的基础角色。 */
export function createRoleFormSchema(bases: readonly RoleDetail[]) {
  return {
    safeParse(input: unknown) {
      const raw = typeof input === "object" && input !== null ? input : {};
      const id = "baseRoleId" in raw ? raw.baseRoleId : undefined;
      const base = bases.find(
        (role) => role.kind === "preset" && role.id === id,
      );
      return createRoleSchema.safeParse({ ...raw, dataScope: base?.dataScope });
    },
  };
}
export function boundedRoleSchema(scopes: ActorScopes) {
  return {
    safeParse(input: unknown) {
      const parsed = saveRoleGrantsSchema.safeParse(input);
      if (!parsed.success || grantsFit(scopes, parsed.data)) return parsed;
      return {
        success: false as const,
        error: {
          issues: [
            {
              path: ["grants"],
              message:
                "不能授予超过自己权限或数据范围的设置，请减少权限或缩小数据范围。",
            },
          ],
        },
      };
    },
  };
}
