import { Inject, Injectable } from "@nestjs/common";
import {
  PresetRolesRepository,
  type TemplateSource,
} from "./preset-roles.repository.js";
import {
  defaults,
  differences,
  effective,
  type TemplateRow,
  templateFeatures,
} from "./template-values.js";
@Injectable()
export class TemplateReader {
  constructor(
    @Inject(PresetRolesRepository)
    private readonly repository: PresetRolesRepository,
  ) {}
  async usage(tx: TemplateSource, row: TemplateRow) {
    const related = (
      await this.repository.dependentRoles(tx, row.role.id)
    ).filter((r) => r.identityType === row.role.identityType);
    const identities = await this.repository.usage(
      tx,
      related.map((r) => r.id),
      row.role.identityType,
    );
    return {
      related,
      identities,
      counts: {
        organizationCount: new Set(identities.map((r) => r.orgId)).size,
        userCount: new Set(identities.map((r) => r.userId)).size,
        identityCount: identities.length,
      },
    };
  }
  async detail(tx: TemplateSource, row: TemplateRow, canUpdate: boolean) {
    const base = defaults(await this.repository.grants(tx, [row.role.id]));
    const final = effective(row, base);
    const modified = differences(base, final.grants);
    const editable = row.role.code !== "company-super-admin" && canUpdate;
    return {
      id: row.role.id,
      name: row.role.name,
      identityType: row.role.identityType,
      version: row.role.version,
      dataScope: final.dataScope,
      defaultDataScope: row.role.dataScope,
      remark: final.remark,
      modified: Boolean(row.override),
      editable,
      allowedActions: editable ? ["update", "reset"] : [],
      grants: templateFeatures.map((feature) => ({
        app: feature.app,
        feature: feature.feature,
        appName: feature.appName,
        featureName: feature.featureName,
        defaultGrant: base.find(
          (g) => g.app === feature.app && g.feature === feature.feature,
        )?.grant ?? { level: "none" },
        grant: final.grants.find(
          (g) => g.app === feature.app && g.feature === feature.feature,
        )?.grant ?? { level: "none" },
        modified: modified.some(
          (g) => g.app === feature.app && g.feature === feature.feature,
        ),
      })),
      usage: (await this.usage(tx, row)).counts,
    };
  }
}
