import { Inject, Injectable } from "@nestjs/common";
import { isOrganizationAdministrator } from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import {
  AdministratorRepository,
  type AdministratorTransaction,
} from "./administrator.repository.js";
import { RolesService } from "./roles.service.js";

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
}

@Injectable()
export class AdministratorService {
  constructor(
    @Inject(AdministratorRepository)
    private readonly repository: AdministratorRepository,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}

  /** 角色或模板写入前，锁定并记录受影响组织中原有的管理员。 */
  async beforeRoleChange(tx: AdministratorTransaction, roleId: string) {
    await this.repository.lock(tx);
    const orgs = await this.repository.affectedOrganizations(tx, roleId);
    return this.beforeMemberChange(
      tx,
      orgs.map((org) => org.id),
    );
  }

  /** 成员调整角色、停用或删除前调用，必须早于业务行锁和写入。 */
  async beforeMemberChange(tx: AdministratorTransaction, orgIds: string[]) {
    await this.repository.lock(tx);
    return this.managedOrganizations(tx, [...new Set(orgIds)]);
  }

  /** 与写入共用事务；失败抛错使授权、版本和审计一并回滚。 */
  async assertRetained(
    tx: AdministratorTransaction,
    protectedOrgIds: string[],
  ) {
    const retained = new Set(
      await this.managedOrganizations(tx, protectedOrgIds),
    );
    if (protectedOrgIds.some((orgId) => !retained.has(orgId)))
      throw new ApiException(11104);
  }

  private async managedOrganizations(
    tx: AdministratorTransaction,
    orgIds: string[],
  ) {
    const assignments = await this.repository.assignments(tx, orgIds);
    const grants = await this.roles.resolve(
      [...new Set(assignments.map((row) => row.roleId))],
      tx,
    );
    const byRole = groupBy(grants, (grant) => grant.roleId);
    const identities = groupBy(assignments, (row) => row.identityId);
    const managed = new Set<string>();
    for (const rows of identities.values()) {
      const orgId = rows[0]?.orgId;
      if (
        orgId &&
        isOrganizationAdministrator(
          rows.flatMap((row) => byRole.get(row.roleId) ?? []),
        )
      )
        managed.add(orgId);
    }
    return [...managed];
  }
}
