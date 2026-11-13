import { Inject, Injectable } from "@nestjs/common";
import {
  dataScopeSchema,
  grantSchema,
  type PresetFeatureGrant,
  presetFeatureGrantSchema,
  roleDetailSchema,
} from "@smart-sport/contracts";
import { diffRoleGrants, resolveRoleGrants } from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import {
  RoleManagementRepository,
  type RoleRow,
  type RoleTransaction,
} from "./role-management.repository.js";
import {
  type RoleActor,
  roleFeatures,
  withinRoleCeiling,
} from "./role-policy.js";

@Injectable()
export class RoleReader {
  constructor(
    @Inject(RoleManagementRepository)
    private readonly repository: RoleManagementRepository,
  ) {}
  async values(tx: RoleTransaction, actor: RoleActor, row: RoleRow) {
    const base =
      row.kind === "preset"
        ? row
        : row.baseRoleId
          ? await this.repository.find(tx, actor, row.baseRoleId)
          : undefined;
    if (base?.kind !== "preset" || base.identityType !== row.identityType)
      throw new ApiException(90004);
    const code = await this.stored(tx, base.id);
    const override =
      base.code === "company-super-admin"
        ? undefined
        : await this.repository.template(tx, base.id);
    const inherited = this.complete(
      resolveRoleGrants(
        code,
        override ? presetFeatureGrantSchema.array().parse(override.grants) : [],
      ),
    );
    const grants =
      row.kind === "preset"
        ? inherited
        : this.complete(
            resolveRoleGrants(inherited, await this.stored(tx, row.id)),
          );
    const baseScope = dataScopeSchema.parse(
      override?.dataScope ?? base.dataScope,
    );
    return {
      base,
      inherited,
      grants,
      baseScope,
      dataScope:
        row.kind === "preset"
          ? baseScope
          : dataScopeSchema.parse(row.dataScope),
      remark:
        row.kind === "preset" ? (override?.remark ?? row.remark) : row.remark,
    };
  }
  async detail(tx: RoleTransaction, actor: RoleActor, row: RoleRow) {
    const value = await this.values(tx, actor, row);
    const changes = diffRoleGrants(value.inherited, value.grants);
    const editable =
      row.kind === "custom" &&
      !actor.roleIds.includes(row.id) &&
      actor.permissions.has("org:role:update") &&
      withinRoleCeiling(value.grants, value.dataScope, actor.permissions);
    return roleDetailSchema.parse({
      id: row.id,
      name: row.name,
      kind: row.kind,
      identityType: row.identityType,
      baseRoleId: row.kind === "custom" ? value.base.id : null,
      baseRoleName: row.kind === "custom" ? value.base.name : null,
      dataScope: value.dataScope,
      remark: value.remark,
      version: row.version,
      modified:
        row.kind === "custom" &&
        (changes.length > 0 || value.dataScope !== value.baseScope),
      allowedActions: editable
        ? [
            "update",
            ...(withinRoleCeiling(
              value.inherited,
              value.baseScope,
              actor.permissions,
            )
              ? ["reset"]
              : []),
          ]
        : [],
      grants: roleFeatures.map((feature) => ({
        app: feature.app,
        feature: feature.feature,
        appName: feature.appName,
        featureName: feature.featureName,
        grant: value.grants.find(
          (g) => g.app === feature.app && g.feature === feature.feature,
        )?.grant,
        baseGrant: value.inherited.find(
          (g) => g.app === feature.app && g.feature === feature.feature,
        )?.grant,
        modified: changes.some(
          (g) => g.app === feature.app && g.feature === feature.feature,
        ),
      })),
    });
  }
  private async stored(
    tx: RoleTransaction,
    id: string,
  ): Promise<PresetFeatureGrant[]> {
    return (await this.repository.grants(tx, id)).map((entry) => ({
      app: entry.appCode,
      feature: entry.featureCode,
      grant: grantSchema.parse(
        entry.level === "custom"
          ? { level: entry.level, actions: entry.actions ?? [] }
          : { level: entry.level },
      ),
    }));
  }
  private complete(grants: PresetFeatureGrant[]): PresetFeatureGrant[] {
    return roleFeatures.map(
      ({ app, feature }) =>
        grants.find(
          (entry) => entry.app === app && entry.feature === feature,
        ) ?? { app, feature, grant: { level: "none" } },
    );
  }
}
