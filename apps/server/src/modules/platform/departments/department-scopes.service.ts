import { Inject, Injectable } from "@nestjs/common";
import {
  departmentScopesSchema,
  extraScopeSchema,
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
import { ScopeCandidatesService } from "../scope-candidates/index.js";
import { DepartmentScopesRepository } from "./department-scopes.repository.js";
import {
  type DepartmentRow,
  DepartmentsRepository,
  type DepartmentTransaction,
} from "./departments.repository.js";
import { DepartmentsService } from "./departments.service.js";

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
    @Inject(ScopeCandidatesService)
    private readonly choices: ScopeCandidatesService,
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
        const available = await this.choices.describe(
          tx,
          org.id,
          input.scopes,
          true,
        );
        if (available.scopes.some((item) => !item.available))
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
      return this.choices.query(tx, orgId, query);
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
  private async present(
    tx: DepartmentTransaction,
    org: Organization,
    row: DepartmentRow,
    actor: IdentityContext,
  ) {
    const saved = selections(await this.repository.read(tx, row.id));
    const details = await this.choices.describe(tx, org.id, saved);
    return departmentScopesSchema.parse({
      departmentId: row.id,
      version: row.version,
      scopes: details.scopes,
      schoolCount: await this.scopes.countSelection(org.id, saved, tx),
      allowedTypes: allowedTypes(org),
      allowedActions: actor.permissions.has("org:department:update")
        ? ["update"]
        : [],
    });
  }
}
