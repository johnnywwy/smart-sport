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
  type ScopePreview,
  type VisibleScope,
} from "@smart-sport/contracts";
import { calculateVisibleScope } from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import { SERVER_CONFIG } from "../../../server-config.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { type ScopeReadDatabase, ScopeRepository } from "./scope.repository.js";
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

  /** 配置摘要仅展开所选范围；使用目标组织边界，可与写入共用事务，不混入成员角色或额外范围。 */
  async countSelection(
    orgId: string,
    selections: RawSelection[],
    db?: ScopeReadDatabase,
  ) {
    const org = await this.repository.organization(orgId, db);
    if (!org || (org.type !== "company" && org.type !== "bureau")) return 0;
    if (org.type === "bureau" && (!org.regionPath || org.regionStatus !== 1))
      return 0;
    return (
      await this.expand(
        org.type === "bureau" ? (org.regionPath ?? undefined) : undefined,
        selections,
        db,
      )
    ).length;
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
  private async calculate(context: IdentityContext, option: DataScopeOption) {
    return (await this.explain(context, option)).scope;
  }
  /** 实际查询和草稿预览共用计算路径；草稿只能覆盖本人选择，不改变组织边界。 */
  async explain(
    context: Pick<
      IdentityContext,
      "orgId" | "identityId" | "identityType" | "departmentId"
    >,
    option: DataScopeOption | undefined,
    personal?: RawSelection[],
  ): Promise<{ scope: VisibleScope; summary: ScopePreview }> {
    const org = await this.repository.organization(context.orgId);
    const supported =
      (context.identityType === "company" ||
        context.identityType === "bureau") &&
      org?.type === context.identityType;
    const summary: ScopePreview = {
      schoolCount: 0,
      supported,
      dataScope: option ?? null,
      warnings: supported ? [] : ["unsupported_identity"],
      steps: [],
    };
    if (!supported) return { scope: empty(), summary };
    const boundary =
      context.identityType === "bureau"
        ? (org?.regionPath ?? undefined)
        : undefined;
    if (
      context.identityType === "bureau" &&
      (!boundary || org?.regionStatus !== 1)
    )
      return { scope: empty(), summary };
    const outer = await this.repository.schools(boundary);
    const department = context.departmentId
      ? await this.repository.department(context.orgId, context.departmentId)
      : undefined;
    const departmentRows =
      department && option && option !== "personal" && option !== "all"
        ? await this.repository.departmentSelections(
            context.orgId,
            department.path,
            option === "dept_and_below",
          )
        : [];
    const personalRows =
      personal ??
      (await this.repository.personalSelections(context.identityId));
    const departmentIds = (await this.expand(boundary, departmentRows)).map(
      (s) => s.id,
    );
    const personalIds = (await this.expand(boundary, personalRows)).map(
      (s) => s.id,
    );
    const union = [...new Set([...departmentIds, ...personalIds])];
    if (!option) summary.warnings.push("permission_not_granted");
    if ((option === "dept" || option === "dept_and_below") && !department)
      summary.warnings.push("missing_department");
    const scope = option
      ? calculateVisibleScope({
          identity:
            context.identityType === "company"
              ? { type: "company", boundary: { kind: "all-schools" } }
              : {
                  type: "bureau",
                  boundary: {
                    kind: "schools",
                    schoolIds: outer.map((s) => s.id),
                  },
                },
          option,
          hasDepartment: Boolean(department),
          department: [],
          departmentAndBelow: [],
          extra: [{ kind: "schools", schoolIds: union }],
        })
      : empty();
    const schoolCount =
      scope.kind === "all-schools"
        ? outer.length
        : scope.kind === "schools"
          ? scope.schoolIds.length
          : 0;
    summary.schoolCount = schoolCount;
    summary.steps = [
      {
        kind: "boundary",
        name: "组织外边界内的启用学校",
        schoolCount: outer.length,
      },
      {
        kind: "department",
        name:
          option === "dept_and_below"
            ? "本部门及下级负责学校（边界内）"
            : "本部门负责学校（边界内）",
        schoolCount: departmentIds.length,
      },
      {
        kind: "role",
        name:
          option === "all" ? "角色范围：本机构全部" : "角色范围展开（边界内）",
        schoolCount: option === "all" ? outer.length : departmentIds.length,
      },
      {
        kind: "personal",
        name: "本人额外负责学校（边界内）",
        schoolCount: personalIds.length,
      },
      {
        kind: "union",
        name: "角色范围与本人额外负责去重合并",
        schoolCount: option === "all" ? outer.length : union.length,
      },
      {
        kind: "visible",
        name: summary.warnings.includes("missing_department")
          ? "未分配部门，部门档位实际可见为空"
          : "与组织外边界相交后的实际可见学校",
        schoolCount,
      },
    ];
    return { scope, summary };
  }
  private expand(
    boundary: string | undefined,
    selections: RawSelection[],
    db?: ScopeReadDatabase,
  ) {
    const parsed = selections.flatMap((s) => {
      const result = extraScopeSchema.safeParse(s);
      return result.success ? [result.data] : [];
    });
    return this.repository.schools(
      boundary,
      {
        schoolIds: parsed
          .filter((s) => s.type === "school")
          .map((s) => s.value),
        regionCodes: parsed
          .filter((s) => s.type === "region")
          .map((s) => s.value),
      },
      undefined,
      db,
    );
  }
}
