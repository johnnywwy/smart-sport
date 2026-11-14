import { Inject, Injectable } from "@nestjs/common";
import type {
  PresetFeatureGrant,
  ResetPresetRole,
  SavePresetRole,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import { IdentityContextService } from "../identity-context/index.js";
import { AdministratorService } from "../roles/index.js";
import {
  PresetRolesRepository,
  type TemplateTransaction,
} from "./preset-roles.repository.js";
import { templateMenuChanges } from "./template-impact.js";
import { TemplateReader } from "./template-reader.js";
import {
  defaults,
  differences,
  effective,
  type TemplateRow,
  templateFeatures,
} from "./template-values.js";
export type TemplateActor = {
  userId: string;
  identityId: string;
  orgId: string;
  canUpdate: boolean;
};
export type TemplateMetadata = {
  traceId: string;
  ip: string;
  userAgent: string;
};
@Injectable()
export class PresetRolesService {
  constructor(
    @Inject(AdministratorService)
    private readonly administrators: AdministratorService,
    @Inject(PresetRolesRepository)
    private readonly repository: PresetRolesRepository,
    @Inject(IdentityContextService)
    private readonly context: IdentityContextService,
    @Inject(TemplateReader) private readonly reader: TemplateReader,
  ) {}

  async list(identityType: string | undefined, canUpdate: boolean) {
    return this.repository.transaction(async (tx) => {
      const rows = (await this.repository.list(tx)).filter(
        (r) => !identityType || r.role.identityType === identityType,
      );
      const result = [];
      for (const row of rows)
        result.push(await this.reader.detail(tx, row, canUpdate));
      return result;
    });
  }
  private async load(tx: TemplateTransaction, id: string, version: number) {
    const role = await this.repository.lock(tx, id);
    if (!role) throw new ApiException(90004);
    if (role.version !== version) throw new ApiException(90002);
    const row = (await this.repository.list(tx)).find((r) => r.role.id === id);
    if (!row) throw new ApiException(90004);
    return row;
  }
  async impact(id: string, input: SavePresetRole) {
    return this.repository.transaction(async (tx) => {
      const row = await this.load(tx, id, input.version);
      this.ensureEditable(row);
      const base = defaults(await this.repository.grants(tx, [id]));
      const before = effective(row, base);
      const usage = await this.reader.usage(tx, row);
      const grants = await this.repository.grants(
        tx,
        usage.related.map((r) => r.id),
      );
      const custom = new Map<string, PresetFeatureGrant[]>();
      for (const role of usage.related.filter((r) => r.kind === "custom")) {
        // differences 只需要已调整行，不能将缺失行填成none。
        custom.set(
          role.id,
          defaults(grants.filter((g) => g.roleId === role.id)).filter((g) =>
            grants.some(
              (r) =>
                r.roleId === role.id &&
                r.appCode === g.app &&
                r.featureCode === g.feature,
            ),
          ),
        );
      }
      return {
        ...usage.counts,
        version: row.role.version,
        dataScopeChanged: before.dataScope !== input.dataScope,
        menuChanges: templateMenuChanges(
          row.role.identityType,
          before.grants,
          input.grants,
          usage.related,
          custom,
        ),
      };
    });
  }
  async save(
    id: string,
    input: SavePresetRole,
    actor: TemplateActor,
    metadata: TemplateMetadata,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      const row = await this.load(tx, id, input.version);
      this.ensureEditable(row);
      await this.write(tx, row, input, actor, metadata, "preset-role.update");
      const updated = (await this.repository.list(tx)).find(
        (r) => r.role.id === id,
      );
      if (!updated) throw new Error("角色模板更新后缺失");
      return this.reader.detail(tx, updated, actor.canUpdate);
    });
    await this.context.invalidate();
    return result;
  }
  async reset(
    id: string,
    input: ResetPresetRole,
    actor: TemplateActor,
    metadata: TemplateMetadata,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      const row = await this.load(tx, id, input.version);
      this.ensureEditable(row);
      const base = defaults(await this.repository.grants(tx, [id]));
      const before = effective(row, base);
      const feature = input.feature;
      if (
        feature &&
        !templateFeatures.some(
          (f) => f.app === feature.app && f.feature === feature.feature,
        )
      )
        throw new ApiException(90001);
      const grants = feature
        ? before.grants.map((g) =>
            g.app === feature.app && g.feature === feature.feature
              ? (base.find((b) => b.app === g.app && b.feature === g.feature) ??
                g)
              : g,
          )
        : base;
      await this.write(
        tx,
        row,
        {
          version: input.version,
          grants,
          dataScope: feature
            ? before.dataScope
            : (row.role.dataScope as SavePresetRole["dataScope"]),
          remark: feature ? before.remark : row.role.remark,
        },
        actor,
        metadata,
        "preset-role.reset",
      );
      const updated = (await this.repository.list(tx)).find(
        (r) => r.role.id === id,
      );
      if (!updated) throw new Error("角色模板恢复后缺失");
      return this.reader.detail(tx, updated, actor.canUpdate);
    });
    await this.context.invalidate();
    return result;
  }
  private ensureEditable(row: TemplateRow) {
    if (row.role.code === "company-super-admin") throw new ApiException(11105);
  }
  private async write(
    tx: TemplateTransaction,
    row: TemplateRow,
    input: SavePresetRole,
    actor: TemplateActor,
    metadata: TemplateMetadata,
    action: string,
  ) {
    const protectedOrgs = await this.administrators.beforeRoleChange(
      tx,
      row.role.id,
    );
    const base = defaults(await this.repository.grants(tx, [row.role.id]));
    const before = effective(row, base);
    const grants = differences(base, input.grants);
    const dataScope =
      input.dataScope === row.role.dataScope ? null : input.dataScope;
    const remark = input.remark === row.role.remark ? null : input.remark;
    const override =
      grants.length || dataScope || remark !== null
        ? { grants, dataScope, remark }
        : null;
    if (
      !(await this.repository.persist(
        tx,
        row.role.id,
        actor.identityId,
        input.version,
        override,
      ))
    )
      throw new ApiException(90002);
    await this.administrators.assertRetained(tx, protectedOrgs);
    await this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId: actor.orgId,
      action,
      targetType: "preset-role",
      targetId: row.role.id,
      changes: {
        before,
        after: {
          dataScope: input.dataScope,
          remark: input.remark,
          grants: input.grants,
        },
      },
      ...metadata,
      createdAt: new Date(),
    });
  }
}
