import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateRole,
  type ResetRole,
  roleSummarySchema,
  type SaveRoleGrants,
} from "@smart-sport/contracts";
import { diffRoleGrants } from "@smart-sport/domain";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import { IdentityContextService } from "../identity-context/index.js";
import {
  RoleManagementRepository,
  type RoleTransaction,
} from "./role-management.repository.js";
import {
  grantsFitIdentity,
  type RoleActor,
  type RoleMetadata,
  withinRoleCeiling,
} from "./role-policy.js";
import { RoleReader } from "./role-reader.js";

@Injectable()
export class RoleManagementService {
  constructor(
    @Inject(RoleManagementRepository)
    private readonly repository: RoleManagementRepository,
    @Inject(RoleReader) private readonly reader: RoleReader,
    @Inject(IdentityContextService)
    private readonly context: IdentityContextService,
  ) {}

  /** 返回当前组织适用的内置角色和本组织自定义角色。 */
  list(actor: RoleActor, identityType?: string) {
    return this.repository.transaction(async (tx) => {
      const rows = (await this.repository.list(tx, actor)).filter(
        (row) => !identityType || row.identityType === identityType,
      );
      const result = [];
      for (const row of rows)
        result.push(
          roleSummarySchema.parse(await this.reader.detail(tx, actor, row)),
        );
      return result;
    });
  }
  detail(id: string, actor: RoleActor) {
    return this.repository.transaction(async (tx) =>
      this.reader.detail(tx, actor, await this.load(tx, id, actor)),
    );
  }
  /** 基于内置角色创建，不复制授权行，后续继续继承模板最终值。 */
  async create(input: CreateRole, actor: RoleActor, metadata: RoleMetadata) {
    const result = await this.repository.transaction(async (tx) => {
      const base = await this.load(tx, input.baseRoleId, actor);
      if (base.kind !== "preset") throw new ApiException(90004);
      const values = await this.reader.values(tx, actor, base);
      if (!withinRoleCeiling(values.grants, input.dataScope, actor.permissions))
        throw new ApiException(11102);
      const id = v7();
      const row = await this.repository.insert(tx, {
        id,
        kind: "custom",
        baseRoleId: base.id,
        identityType: base.identityType,
        orgId: actor.orgId,
        code: `custom-${id}`,
        name: input.name,
        dataScope: input.dataScope,
        createdBy: actor.identityId,
        updatedBy: actor.identityId,
      });
      const after = await this.reader.detail(tx, actor, row);
      await this.audit(tx, actor, metadata, "role.create", id, null, after);
      return after;
    });
    await this.context.invalidate();
    return result;
  }
  /** 整体提交只存相对基础角色最终值的差异，版本冲突不产生副作用。 */
  async save(
    id: string,
    input: SaveRoleGrants,
    actor: RoleActor,
    metadata: RoleMetadata,
  ) {
    return this.change(id, input, actor, metadata, false);
  }
  async reset(
    id: string,
    input: ResetRole,
    actor: RoleActor,
    metadata: RoleMetadata,
  ) {
    return this.change(id, input, actor, metadata, true);
  }
  private async change(
    id: string,
    input: SaveRoleGrants | ResetRole,
    actor: RoleActor,
    metadata: RoleMetadata,
    reset: boolean,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      const row = await this.load(tx, id, actor);
      if (row.kind !== "custom") throw new ApiException(11105);
      if (actor.roleIds.includes(id)) throw new ApiException(11103);
      if (row.version !== input.version) throw new ApiException(90002);
      const value = await this.reader.values(tx, actor, row);
      const grants = "grants" in input ? input.grants : value.inherited;
      const scope = "dataScope" in input ? input.dataScope : value.baseScope;
      // 修改高于自身的已有角色同样会绕过分级管理；先后值均需满足权限上限。
      if (
        !withinRoleCeiling(value.grants, value.dataScope, actor.permissions) ||
        !withinRoleCeiling(grants, scope, actor.permissions) ||
        !grantsFitIdentity(grants, row.identityType)
      )
        throw new ApiException(11102);
      const before = await this.reader.detail(tx, actor, row);
      const updated = await this.repository.update(
        tx,
        row,
        actor,
        scope,
        input.version,
      );
      if (!updated) throw new ApiException(90002);
      const differences = diffRoleGrants(value.inherited, grants);
      await this.repository.replaceGrants(
        tx,
        id,
        differences.map((entry) => ({
          appCode: entry.app,
          featureCode: entry.feature,
          level: entry.grant.level,
          actions: entry.grant.level === "custom" ? entry.grant.actions : null,
        })),
      );
      const after = await this.reader.detail(tx, actor, updated);
      await this.audit(
        tx,
        actor,
        metadata,
        reset ? "role.reset" : "role.update",
        id,
        before,
        after,
      );
      return after;
    });
    await this.context.invalidate();
    return result;
  }
  private async load(tx: RoleTransaction, id: string, actor: RoleActor) {
    const row = await this.repository.find(tx, actor, id);
    if (!row) throw new ApiException(90004);
    return row;
  }
  private audit(
    tx: RoleTransaction,
    actor: RoleActor,
    metadata: RoleMetadata,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    return this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId: actor.orgId,
      action,
      targetType: "role",
      targetId: id,
      changes: { before, after },
      ...metadata,
      createdAt: new Date(),
    });
  }
}
