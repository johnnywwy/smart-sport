import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  actionSchema,
  appDefinitions,
  type DataScopeOption,
  type DeclaredPermissionCode,
  type ExtraScope,
  extraScopesSchema,
  type IdentityVisibleQuery,
  identityTypeSchema,
  identityVisibleSchema,
  type ScopePreviewRequest,
  type ScopeSchoolsQuery,
  scopePermissionSchema,
  scopePreviewSchema,
  scopeSchoolsSchema,
} from "@smart-sport/contracts";
import { withinRoleCeiling } from "@smart-sport/domain";
import { ApiException, invalidRequest } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { MembersService } from "../members/index.js";
import { RolesService } from "../roles/index.js";
import { ScopeRepository } from "./scope.repository.js";
import { ScopeService } from "./scope.service.js";
import { ScopeQueryRepository } from "./scope-query.repository.js";

@Injectable()
export class ScopeQueryService {
  constructor(
    @Inject(ScopeQueryRepository)
    private readonly repository: ScopeQueryRepository,
    @Inject(ScopeRepository) private readonly calculation: ScopeRepository,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}
  /** 列表按所需动作过滤，行操作继续使用各自的独立范围。 */
  schools(actor: IdentityContext, query: ScopeSchoolsQuery) {
    return this.stable(actor, async (fresh) => {
      const scope = await this.scopes.resolve(
        fresh.identityId,
        query.permission,
      );
      const list = await this.repository.schools(scope, query);
      return scopeSchoolsSchema.parse({
        ...list,
        items: await this.actions(fresh, query.permission, list.items),
      });
    });
  }
  /** 组织成员查询只读目标的真实配置，不允许从请求传入较宽角色或部门。 */
  visible(actor: IdentityContext, id: string, query: IdentityVisibleQuery) {
    return this.stable(actor, async (fresh) => {
      const orgId = (query.orgId ?? fresh.orgId).toLowerCase();
      await this.members.resolveOrganization(
        fresh,
        orgId,
        false,
        "org:member:view",
      );
      id = id.toLowerCase();
      if (!(await this.repository.identity(orgId, id)))
        throw new ApiException(90004);
      const target = await this.contexts.load(id);
      const calculated = await this.scopes.explain(
        target,
        target.permissions.get(query.permission),
      );
      const list = await this.repository.schools(calculated.scope, query);
      const rows = await this.repository.roleRows(
        orgId,
        target.identityType,
        target.roleIds,
      );
      const contributing = await this.contributions(rows, query.permission);
      return identityVisibleSchema.parse({
        ...list,
        ...calculated.summary,
        identityId: id,
        permission: query.permission,
        permissionName: this.permissionName(query.permission),
        roles: contributing,
        items: await this.actions(target, query.permission, list.items),
      });
    });
  }
  /** 未保存草稿只计算；选择预览与身份实际范围明确区分，不写库或缓存草稿。 */
  preview(actor: IdentityContext, input: ScopePreviewRequest) {
    return this.stable(actor, async (fresh) => {
      const orgId = (input.orgId ?? fresh.orgId).toLowerCase();
      await this.members.resolveOrganization(
        fresh,
        orgId,
        false,
        "org:role:view",
      );
      const org = await this.calculation.organization(orgId);
      if (!org) throw new ApiException(90004);
      const selections = input.scopes.map((s) => ({
        ...s,
        value:
          s.type === "school" || s.type === "college"
            ? s.value.toLowerCase()
            : s.value,
      }));
      const normalized = extraScopesSchema.safeParse(selections);
      if (!normalized.success) throw invalidRequest(normalized.error.issues);
      await this.validateSelection(org, normalized.data);
      const supported = org.type === "company" || org.type === "bureau";
      if (input.mode === "selection") {
        const schoolCount = await this.scopes.countSelection(orgId, selections);
        return scopePreviewSchema.parse({
          schoolCount,
          supported,
          dataScope: null,
          warnings: supported ? [] : ["unsupported_identity"],
          steps: [
            {
              kind: "selection",
              name: "所选范围与组织外边界相交后的去重学校",
              schoolCount,
            },
          ],
        });
      }
      const departmentId = input.departmentId?.toLowerCase() ?? null;
      if (
        departmentId &&
        !(await this.calculation.department(orgId, departmentId))
      )
        throw new ApiException(90004);
      const ids = input.roleIds.map((id) => id.toLowerCase());
      const rows = await this.repository.roleRows(orgId, org.type, ids);
      if (rows.length !== ids.length) throw new ApiException(90004);
      const grants = await this.roles.resolve(ids);
      for (const row of rows) {
        const entries = grants.filter((g) => g.roleId === row.id);
        const first = entries[0];
        if (!first) throw new ApiException(90004);
        if (!withinRoleCeiling(entries, first.scope, fresh.permissions))
          throw new ApiException(11102);
      }
      const permissions = await this.roles.permissions(ids);
      const option = permissions.get(input.permission);
      const { summary } = await this.scopes.explain(
        {
          ...fresh,
          orgId,
          identityType: identityTypeSchema.parse(org.type),
          departmentId,
        },
        option,
        selections,
      );
      return scopePreviewSchema.parse(summary);
    });
  }
  private async validateSelection(
    org: NonNullable<Awaited<ReturnType<ScopeRepository["organization"]>>>,
    selections: ExtraScope[],
  ) {
    if (!selections.length) return;
    if (
      !["company", "bureau"].includes(org.type) ||
      selections.some((s) => s.type !== "school" && s.type !== "region")
    )
      throw new ApiException(12004);
    if (org.type === "bureau" && (!org.regionPath || org.regionStatus !== 1))
      throw new ApiException(90004);
    const rows = await this.repository.validSelection(selections);
    if (
      rows.length !== selections.length ||
      rows.some(
        (r) =>
          org.type === "bureau" &&
          r.path !== org.regionPath &&
          !r.path.startsWith(`${org.regionPath}.`),
      )
    )
      throw new ApiException(90004);
  }
  private async contributions(
    rows: { id: string; name: string }[],
    permission: DeclaredPermissionCode,
  ) {
    const result: { id: string; name: string; dataScope: DataScopeOption }[] =
      [];
    for (const row of rows) {
      const dataScope = (await this.roles.permissions([row.id])).get(
        permission,
      );
      if (dataScope) result.push({ ...row, dataScope });
    }
    return result;
  }
  private async actions<T extends { id: string }>(
    context: IdentityContext,
    permission: DeclaredPermissionCode,
    rows: T[],
  ) {
    const prefix = permission.slice(0, permission.lastIndexOf(":"));
    const scopes = new Map<
      string,
      Awaited<ReturnType<ScopeService["resolve"]>>
    >();
    for (const action of actionSchema.options) {
      const code = scopePermissionSchema.safeParse(`${prefix}:${action}`);
      if (code.success && context.permissions.has(code.data))
        scopes.set(
          action,
          await this.scopes.resolve(context.identityId, code.data),
        );
    }
    return rows.map((row) => ({
      ...row,
      allowedActions: [...scopes]
        .filter(
          ([, scope]) =>
            scope.kind === "all-schools" ||
            (scope.kind === "schools" && scope.schoolIds.includes(row.id)),
        )
        .map(([action]) => action),
    }));
  }
  private permissionName(permission: DeclaredPermissionCode) {
    const [app, feature, action] = permission.split(":");
    const definition = appDefinitions.find((a) => a.code === app);
    const name =
      Object.entries(definition?.features ?? {}).find(
        ([key]) => key === feature,
      )?.[1].name ?? "学校业务";
    const names = {
      view: "查看",
      create: "新增",
      update: "修改",
      delete: "删除",
      import: "导入",
      export: "导出",
      approve: "审核",
      sensitive: "查看敏感信息",
    };
    return `${name} · ${names[actionSchema.parse(action)]}`;
  }
  private async stable<T>(
    actor: IdentityContext,
    read: (fresh: IdentityContext) => Promise<T>,
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { context, revision } = await this.contexts.loadSnapshot(
        actor.identityId,
        actor.client,
      );
      try {
        const result = await read(context);
        if (await this.contexts.isCurrent(revision)) return result;
      } catch (error) {
        if (await this.contexts.isCurrent(revision)) throw error;
      }
    }
    throw new ServiceUnavailableException("数据范围正在变更，请重试");
  }
}
