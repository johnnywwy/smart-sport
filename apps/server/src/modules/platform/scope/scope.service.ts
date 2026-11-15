import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  type DataScopeOption,
  type DeclaredPermissionCode,
  extraScopeSchema,
  idSchema,
  type VisibleScope,
} from "@smart-sport/contracts";
import { calculateVisibleScope } from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import { SERVER_CONFIG } from "../../../server-config.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { ScopeRepository } from "./scope.repository.js";
import { type SchoolMembership, ScopeCache } from "./scope-cache.js";

const empty = (): VisibleScope => ({ kind: "schools", schoolIds: [] });
type RawSelection = { type: string; value: string };
@Injectable()
export class ScopeService {
  private readonly cache: ScopeCache;
  constructor(
    @Inject(ScopeRepository) private readonly repository: ScopeRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
    @Inject(SERVER_CONFIG) config: ServerConfig,
  ) {
    this.cache = new ScopeCache(config.REDIS_URL);
  }
  onApplicationShutdown() {
    this.cache.close();
  }

  /** 按动作取该权限自己的范围，不接受调用方传入角色范围或旧身份快照。 */
  resolve(identityId: string, permission: DeclaredPermissionCode) {
    return this.cached(
      identityId,
      permission,
      (id, option, revision) => this.cache.read(id, option, revision),
      (scope) => scope,
    );
  }
  /** 学校不可见返回404；公司全量范围仍核对学校启用状态。 */
  async requireSchool(
    identityId: string,
    permission: DeclaredPermissionCode,
    schoolId: string,
  ) {
    const parsed = idSchema.safeParse(schoolId);
    if (!parsed.success) throw new ApiException(90004);
    schoolId = parsed.data.toLowerCase();
    const allowed = await this.cached<SchoolMembership>(
      identityId,
      permission,
      (id, option, revision) =>
        this.cache.contains(id, option, revision, schoolId),
      (scope) =>
        scope.kind === "all-schools"
          ? "all"
          : scope.kind === "schools" && scope.schoolIds.includes(schoolId),
    );
    if (
      !allowed ||
      (allowed === "all" &&
        !(await this.repository.schools(undefined, undefined, schoolId)).length)
    )
      throw new ApiException(90004);
  }
  private async cached<T>(
    identityId: string,
    permission: DeclaredPermissionCode,
    read: (
      id: string,
      option: DataScopeOption,
      revision: string,
    ) => Promise<T | undefined>,
    convert: (scope: VisibleScope) => T,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { context, revision } = await this.contexts.loadSnapshot(
        identityId.toLowerCase(),
      );
      const option = context.permissions.get(permission);
      if (!option) throw new ApiException(11101);
      let value: T | undefined = await read(
        context.identityId,
        option,
        revision,
      );
      if (value === undefined) {
        const scope = await this.calculate(context, option);
        if (!(await this.contexts.isCurrent(revision))) continue;
        if (
          !(await this.cache.write(context.identityId, option, revision, scope))
        )
          continue;
        value = convert(scope);
      }
      if (await this.contexts.isCurrent(revision)) return value;
    }
    throw new ServiceUnavailableException("数据范围正在变更，请重试");
  }
  private async calculate(
    context: IdentityContext,
    option: DataScopeOption,
  ): Promise<VisibleScope> {
    if (context.identityType !== "company" && context.identityType !== "bureau")
      return empty();
    const organization = await this.repository.organization(context.orgId);
    if (!organization || organization.type !== context.identityType)
      return empty();
    const boundary =
      context.identityType === "bureau"
        ? (organization.regionPath ?? undefined)
        : undefined;
    if (
      context.identityType === "bureau" &&
      (!boundary || organization.regionStatus !== 1)
    )
      return empty();
    const department = context.departmentId
      ? await this.repository.department(context.orgId, context.departmentId)
      : undefined;
    if ((option === "dept" || option === "dept_and_below") && !department)
      return empty();
    if (option === "all" && context.identityType === "company")
      return { kind: "all-schools" };
    const outer = boundary
      ? (await this.repository.schools(boundary)).map((s) => s.id)
      : undefined;
    const selections =
      option === "all"
        ? []
        : [
            ...(await this.repository.personalSelections(context.identityId)),
            ...(department && option !== "personal"
              ? await this.repository.departmentSelections(
                  context.orgId,
                  department.path,
                  option === "dept_and_below",
                )
              : []),
          ];
    const selected =
      option === "all"
        ? []
        : (await this.expand(boundary, selections)).map((s) => s.id);
    return calculateVisibleScope({
      identity:
        context.identityType === "company"
          ? { type: "company", boundary: { kind: "all-schools" } }
          : {
              type: "bureau",
              boundary: { kind: "schools", schoolIds: outer ?? [] },
            },
      option,
      hasDepartment: Boolean(department),
      // 已展开部门与本人额外范围的并集；最终仍由纯函数与外边界相交。
      department: [],
      departmentAndBelow: [],
      extra: [{ kind: "schools", schoolIds: selected }],
    });
  }
  private expand(boundary: string | undefined, selections: RawSelection[]) {
    const parsed = selections.flatMap((s) => {
      const result = extraScopeSchema.safeParse(s);
      return result.success ? [result.data] : [];
    });
    return this.repository.schools(boundary, {
      schoolIds: parsed.filter((s) => s.type === "school").map((s) => s.value),
      regionCodes: parsed
        .filter((s) => s.type === "region")
        .map((s) => s.value),
    });
  }
}
