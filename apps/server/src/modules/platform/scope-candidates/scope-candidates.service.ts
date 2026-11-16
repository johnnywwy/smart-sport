import { Inject, Injectable } from "@nestjs/common";
import type {
  ExtraScope,
  ScopeOption,
  ScopeOptionsQuery,
  ScopeType,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type CandidateDatabase,
  ScopeOptionsRepository,
} from "./scope-options.repository.js";

const types = (type: string): ScopeType[] =>
  type === "company" || type === "bureau" ? ["school", "region"] : [];
@Injectable()
export class ScopeCandidatesService {
  constructor(
    @Inject(ScopeOptionsRepository)
    private readonly repository: ScopeOptionsRepository,
  ) {}
  /** 所有编辑入口共用边界与上级区划校验；权限及目标可管理性由业务服务验证。 */
  async query(db: CandidateDatabase, orgId: string, query: ScopeOptionsQuery) {
    const { org, boundary } = await this.boundary(db, orgId);
    if (!types(org.type).includes(query.type)) throw new ApiException(12004);
    if (query.parent) {
      const parent = await this.repository.region(db, query.parent);
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
        ? await this.repository.schoolOptions(db, input)
        : await this.repository.regionOptions(db, input);
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
      allowedTypes: types(org.type),
    };
  }
  /** 失效选择保留标识且隐藏名称；写入验证时使用共享锁并拒绝失效辖区。 */
  async describe(
    db: CandidateDatabase,
    orgId: string,
    values: ExtraScope[],
    lock = false,
  ) {
    const unavailable = (): ScopeOption[] =>
      values.map((s) => ({
        ...s,
        name: "已失效的负责范围",
        available: false,
        parentValue: null,
      }));
    let config: Awaited<ReturnType<ScopeCandidatesService["boundary"]>>;
    try {
      config = await this.boundary(db, orgId, lock);
    } catch (error) {
      if (lock || !(error instanceof ApiException) || error.code !== 90004)
        throw error;
      return { scopes: unavailable(), allowedTypes: [] as ScopeType[] };
    }
    const allowedTypes = types(config.org.type);
    if (!allowedTypes.length) return { scopes: unavailable(), allowedTypes };
    const school = await this.repository.schoolOptions(
      db,
      {
        boundary: config.boundary,
        ids: values.filter((s) => s.type === "school").map((s) => s.value),
      },
      lock,
    );
    const region = await this.repository.regionOptions(
      db,
      {
        boundary: config.boundary,
        ids: values.filter((s) => s.type === "region").map((s) => s.value),
      },
      lock,
    );
    const available = new Map<string, ScopeOption>();
    for (const [type, rows] of [
      ["school", school.items],
      ["region", region.items],
    ] as const)
      for (const row of rows)
        available.set(`${type}:${row.value}`, {
          type,
          value: row.value,
          name: row.name,
          parentValue: row.parentValue,
          available: true,
        });
    return {
      scopes: unavailable().map(
        (s) => available.get(`${s.type}:${s.value}`) ?? s,
      ),
      allowedTypes,
    };
  }
  private async boundary(db: CandidateDatabase, orgId: string, lock = false) {
    const org = await this.repository.organization(db, orgId, lock);
    if (!org) throw new ApiException(90004);
    const region =
      org.type === "bureau" && org.regionCode
        ? await this.repository.region(db, org.regionCode, lock)
        : undefined;
    if (org.type === "bureau" && !region) throw new ApiException(90004);
    return { org, boundary: region?.path };
  }
}
