import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateDepartment,
  Department,
  DepartmentOrgQuery,
  UpdateDepartment,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { DepartmentStatisticsRepository } from "./department-statistics.repository.js";
import { departmentContract, departmentTree } from "./departments.mapper.js";
import {
  type DepartmentRow,
  DepartmentsRepository,
  type DepartmentTransaction,
} from "./departments.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(DepartmentsRepository)
    private readonly repository: DepartmentsRepository,
    @Inject(DepartmentStatisticsRepository)
    private readonly statistics: DepartmentStatisticsRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  /** 在幂等重放前验证指定组织权限，不能把公司普通员工当作平台超管。 */
  resolveOrganization(actor: IdentityContext, query: DepartmentOrgQuery) {
    return this.repository.transaction(async (tx) => {
      if (
        query.orgId !== undefined &&
        (actor.identityType !== "company" ||
          actor.orgType !== "company" ||
          !(await this.repository.isSuperAdmin(tx, actor.roleIds)))
      )
        throw new ApiException(11101);
      const orgId = query.orgId ?? actor.orgId;
      if (!(await this.repository.organization(tx, orgId)))
        throw new ApiException(90004);
      return orgId;
    });
  }
  /** 返回当前组织部门树、直属去重人数和已配置范围摘要。 */
  tree(orgId: string, actor: IdentityContext) {
    return this.repository.transaction(async (tx) => {
      const rows = await this.repository.list(tx, orgId);
      const members = await this.statistics.memberCounts(tx, orgId);
      const scopes = await this.statistics.scopeCounts(tx, orgId);
      const parents = new Set(rows.map((row) => row.parentId));
      const counts = new Map(
        members.map((row) => [row.departmentId, row.count]),
      );
      return {
        allowedActions: actor.permissions.has("org:department:create")
          ? ["create" as const]
          : [],
        items: departmentTree(
          rows.map((row) =>
            departmentContract(
              row,
              actor,
              counts.get(row.id) ?? 0,
              parents.has(row.id),
              scopes
                .filter((s) => s.departmentId === row.id)
                .map((s) => ({
                  type: s.type as Department["scopeSummary"][number]["type"],
                  count: s.count,
                })),
            ),
          ),
        ),
        unassignedMemberCount: counts.get(null) ?? 0,
      };
    });
  }
  /** 新建部门，组织级锁使重名检查和树移动互斥。 */
  async create(
    orgId: string,
    input: CreateDepartment,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      await this.lockOrganization(tx, orgId);
      const parentId = input.parentId ?? null;
      const parent = parentId ? await this.find(tx, orgId, parentId) : null;
      await this.ensureName(tx, orgId, parentId, input.name);
      const id = v7();
      const row = await this.repository.insert(tx, {
        id,
        orgId,
        parentId,
        path: parent ? `${parent.path}.${id}` : id,
        name: input.name,
        code: `DEPT_${id.replaceAll("-", "")}`,
        createdBy: actor.identityId,
        updatedBy: actor.identityId,
      });
      await this.audit(tx, "department.create", row, actor, metadata, {
        name: [null, row.name],
        parentId: [null, parentId],
      });
      return departmentContract(row, actor);
    });
    await this.contexts.invalidate();
    return result;
  }
  /** 改名、排序或移动；子孙路径与版本在同一事务中更新。 */
  async update(
    orgId: string,
    id: string,
    input: UpdateDepartment,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      await this.lockOrganization(tx, orgId);
      const current = await this.find(tx, orgId, id, true);
      this.checkVersion(current, input.version);
      const parentId =
        input.parentId === undefined ? current.parentId : input.parentId;
      const parent = parentId ? await this.find(tx, orgId, parentId) : null;
      if (
        parent &&
        (parent.id === id || parent.path.startsWith(`${current.path}.`))
      )
        throw new ApiException(12003);
      const name = input.name ?? current.name;
      await this.ensureName(tx, orgId, parentId, name, id);
      const path = parent ? `${parent.path}.${id}` : id;
      const row = await this.repository.update(
        tx,
        orgId,
        id,
        input.version,
        actor.identityId,
        { name, parentId, path, sort: input.sort ?? current.sort },
      );
      if (!row) throw new ApiException(90002);
      const descendants =
        path !== current.path
          ? await this.repository.moveDescendants(
              tx,
              orgId,
              current.path,
              path,
              actor.identityId,
            )
          : [];
      await this.audit(
        tx,
        path !== current.path ? "department.move" : "department.update",
        row,
        actor,
        metadata,
        {
          name: [current.name, name],
          parentId: [current.parentId, parentId],
          sort: [current.sort, row.sort],
          path: [current.path, path],
          descendantCount: descendants.length,
        },
      );
      return this.present(tx, row, actor);
    });
    await this.contexts.invalidate();
    return result;
  }
  /** 软删除空部门，预置部门和仍有关联的部门禁止删除。 */
  async remove(
    orgId: string,
    id: string,
    version: number,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    await this.repository.transaction(async (tx) => {
      await this.lockOrganization(tx, orgId);
      const current = await this.find(tx, orgId, id, true);
      this.checkVersion(current, version);
      if (current.isPreset) throw new ApiException(12007);
      if (
        (await this.repository.hasChildren(tx, orgId, id)) ||
        (await this.repository.hasMembers(tx, id))
      )
        throw new ApiException(12002);
      if (
        !(await this.repository.update(
          tx,
          orgId,
          id,
          version,
          actor.identityId,
          { deletedAt: new Date() },
        ))
      )
        throw new ApiException(90002);
      await this.audit(tx, "department.delete", current, actor, metadata, {
        deleted: [false, true],
      });
    });
    await this.contexts.invalidate();
    return null;
  }
  private async lockOrganization(tx: DepartmentTransaction, orgId: string) {
    if (!(await this.repository.organization(tx, orgId, true)))
      throw new ApiException(90004);
  }
  private async find(
    tx: DepartmentTransaction,
    orgId: string,
    id: string,
    lock = false,
  ) {
    const row = await this.repository.find(tx, orgId, id, lock);
    if (!row) throw new ApiException(90004);
    return row;
  }
  private checkVersion(row: DepartmentRow, version: number) {
    if (row.version !== version) throw new ApiException(90002);
  }
  private async ensureName(
    tx: DepartmentTransaction,
    orgId: string,
    parentId: string | null,
    name: string,
    exceptId?: string,
  ) {
    if (await this.repository.duplicate(tx, orgId, parentId, name, exceptId))
      throw new ApiException(12001);
  }
  private async present(
    tx: DepartmentTransaction,
    row: DepartmentRow,
    actor: IdentityContext,
  ) {
    const members = await this.statistics.memberCounts(tx, row.orgId);
    const scopes = await this.statistics.scopeCounts(tx, row.orgId);
    return departmentContract(
      row,
      actor,
      members.find((v) => v.departmentId === row.id)?.count ?? 0,
      await this.repository.hasChildren(tx, row.orgId, row.id),
      scopes
        .filter((s) => s.departmentId === row.id)
        .map((s) => ({
          type: s.type as Department["scopeSummary"][number]["type"],
          count: s.count,
        })),
    );
  }
  private audit(
    tx: DepartmentTransaction,
    action: string,
    row: DepartmentRow,
    actor: IdentityContext,
    metadata: Metadata,
    changes: Record<string, unknown>,
  ) {
    return this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId: row.orgId,
      action,
      targetType: "department",
      targetId: row.id,
      changes,
      createdAt: new Date(),
      ...metadata,
    });
  }
}
