import { Inject, Injectable } from "@nestjs/common";
import {
  departmentScopesSchema,
  type ExtraScope,
  extraScopeSchema,
  type ScopeOption,
  type ScopeOptionsQuery,
  type ScopeType,
  type SetDepartmentScopes,
  setDepartmentScopesSchema,
} from "@smart-sport/contracts";
import { ApiException, invalidRequest } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { MemberPolicy } from "../members/index.js";
import { ScopeService } from "../scope/index.js";
import { DepartmentScopesRepository } from "./department-scopes.repository.js";
import {
  type DepartmentRow,
  DepartmentsRepository,
  type DepartmentTransaction,
} from "./departments.repository.js";
import { DepartmentsService } from "./departments.service.js";
import { ScopeOptionsRepository } from "./scope-options.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
type Organization = {
  id: string;
  type: string;
  regionCode: string | null;
  status: number;
};
const allowedTypes = (org: Organization): ScopeType[] =>
  org.type === "company" || org.type === "bureau" ? ["school", "region"] : [];
const selections = (rows: { type: string; value: string }[]) =>
  rows.flatMap((row) => {
    const result = extraScopeSchema.safeParse(row);
    return result.success ? [result.data] : [];
  });

@Injectable()
export class DepartmentScopesService {
  constructor(
    @Inject(DepartmentsRepository)
    private readonly departments: DepartmentsRepository,
    @Inject(DepartmentsService) private readonly service: DepartmentsService,
    @Inject(DepartmentScopesRepository)
    private readonly repository: DepartmentScopesRepository,
    @Inject(ScopeOptionsRepository)
    private readonly choices: ScopeOptionsRepository,
    @Inject(MemberPolicy) private readonly policy: MemberPolicy,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
  ) {}
  /** 读取已配置选择、可用状态与当前部门去重学校数，不混入成员最终范围。 */
  get(orgId: string, id: string, actor: IdentityContext) {
    return this.departments.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:department:view");
      await this.policy.organization(tx, actor, orgId, false);
      const org = await this.organization(tx, orgId);
      // 与配置写入共用行锁，避免返回旧版本搭配新选择。
      const row = await this.find(tx, orgId, id.toLowerCase(), true);
      return this.present(tx, org, row, actor);
    });
  }
  /** 事务内重读权限、校验目标边界并整体替换；部门版本与改名移动共用。 */
  async set(
    orgId: string,
    id: string,
    input: SetDepartmentScopes,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    id = id.toLowerCase();
    const result = await this.departments.transaction(async (tx) => {
      await this.repository.lockPermissions(tx);
      actor = await this.policy.actor(tx, actor, "org:department:update");
      await this.policy.organization(tx, actor, orgId, false);
      const org = await this.organization(tx, orgId, true);
      const row = await this.find(tx, orgId, id, true);
      if (row.version !== input.version) throw new ApiException(90002);
      const normalized = setDepartmentScopesSchema.safeParse({
        ...input,
        scopes: input.scopes.map((s) => ({
          ...s,
          value:
            s.type === "school" || s.type === "college"
              ? s.value.toLowerCase()
              : s.value,
        })),
      });
      if (!normalized.success) throw invalidRequest(normalized.error.issues);
      input = normalized.data;
      const before = await this.repository.read(tx, id);
      if (input.scopes.length) {
        if (input.scopes.some((s) => !allowedTypes(org).includes(s.type)))
          throw new ApiException(12004);
        const available = await this.available(tx, org, input.scopes, true);
        if (available.size !== input.scopes.length)
          throw new ApiException(90004);
      }
      const updated = await this.departments.update(
        tx,
        orgId,
        id,
        input.version,
        actor.identityId,
        {},
      );
      if (!updated) throw new ApiException(90002);
      await this.repository.replace(tx, id, input.scopes);
      await this.departments.audit(tx, {
        userId: actor.userId,
        identityId: actor.identityId,
        orgId,
        targetType: "department",
        targetId: id,
        action: "department.scopes.update",
        changes: { scopes: [before, input.scopes] },
        createdAt: new Date(),
        ...metadata,
      });
      return this.present(tx, org, updated, actor);
    });
    await this.contexts.invalidate();
    return result;
  }
  /** 候选只按目标组织外边界查询；公司超管指定组织也不能放宽其辖区。 */
  async options(query: ScopeOptionsQuery, actor: IdentityContext) {
    const orgId = await this.service.resolveOrganization(
      actor,
      query.orgId ? { orgId: query.orgId } : {},
    );
    return this.departments.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:department:update");
      await this.policy.organization(tx, actor, orgId, false);
      const org = await this.organization(tx, orgId);
      if (!allowedTypes(org).includes(query.type))
        throw new ApiException(12004);
      const boundary = await this.boundary(tx, org);
      if (query.parent) {
        const parent = await this.choices.region(tx, query.parent);
        if (
          !parent ||
          (boundary &&
            parent.path !== boundary &&
            !parent.path.startsWith(`${boundary}.`))
        )
          throw new ApiException(90004);
      }
      const input = {
        boundary,
        keyword: query.keyword,
        page: query.page,
        pageSize: query.pageSize,
        parent: query.parent,
        root: !query.parent && !query.keyword,
      };
      const result =
        query.type === "school"
          ? await this.choices.schoolOptions(tx, input)
          : await this.choices.regionOptions(tx, input);
      return {
        items: result.items.map((row) => ({
          type: query.type,
          value: row.value,
          name: row.name,
          parentValue: row.parentValue,
          available: true,
        })),
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
        allowedTypes: allowedTypes(org),
      };
    });
  }
  private async organization(
    tx: DepartmentTransaction,
    id: string,
    lock = false,
  ) {
    const org = await this.departments.organization(tx, id, lock);
    if (org?.status !== 1) throw new ApiException(90004);
    return org;
  }
  private async find(
    tx: DepartmentTransaction,
    orgId: string,
    id: string,
    lock = false,
  ) {
    const row = await this.departments.find(tx, orgId, id, lock);
    if (!row) throw new ApiException(90004);
    return row;
  }
  private async boundary(
    tx: DepartmentTransaction,
    org: Organization,
    lock = false,
  ) {
    if (org.type !== "bureau") return undefined;
    const region = org.regionCode
      ? await this.choices.region(tx, org.regionCode, lock)
      : undefined;
    if (!region) throw new ApiException(90004);
    return region.path;
  }
  private async available(
    tx: DepartmentTransaction,
    org: Organization,
    values: ExtraScope[],
    lock = false,
  ) {
    const result = new Map<string, ScopeOption>();
    if (!allowedTypes(org).length) return result;
    // 查询回显时失效辖区仍保留原选择，写入则拒绝。
    let boundary: string | undefined;
    try {
      boundary = await this.boundary(tx, org, lock);
    } catch (error) {
      if (lock || !(error instanceof ApiException) || error.code !== 90004)
        throw error;
      return result;
    }
    const school = await this.choices.schoolOptions(
      tx,
      {
        boundary,
        ids: values.filter((s) => s.type === "school").map((s) => s.value),
      },
      lock,
    );
    const region = await this.choices.regionOptions(
      tx,
      {
        boundary,
        ids: values.filter((s) => s.type === "region").map((s) => s.value),
      },
      lock,
    );
    for (const [type, rows] of [
      ["school", school.items],
      ["region", region.items],
    ] as const)
      for (const row of rows)
        result.set(`${type}:${row.value}`, {
          type,
          value: row.value,
          name: row.name,
          parentValue: row.parentValue,
          available: true,
        });
    return result;
  }
  private async present(
    tx: DepartmentTransaction,
    org: Organization,
    row: DepartmentRow,
    actor: IdentityContext,
  ) {
    const saved = selections(await this.repository.read(tx, row.id));
    const available = await this.available(tx, org, saved);
    return departmentScopesSchema.parse({
      departmentId: row.id,
      version: row.version,
      scopes: saved.map(
        (s) =>
          available.get(`${s.type}:${s.value}`) ?? {
            ...s,
            name: "已失效的负责范围",
            parentValue: null,
            available: false,
          },
      ),
      schoolCount: await this.scopes.countSelection(org.id, saved, tx),
      allowedTypes: allowedTypes(org),
      allowedActions: actor.permissions.has("org:department:update")
        ? ["update"]
        : [],
    });
  }
}
