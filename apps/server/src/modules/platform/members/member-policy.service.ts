import { Inject, Injectable } from "@nestjs/common";
import {
  type DeclaredPermissionCode,
  dataScopeSchema,
} from "@smart-sport/contracts";
import {
  isOrganizationAdministrator,
  withinRoleCeiling,
} from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import type { IdentityContext } from "../identity-context/index.js";
import { RolesService } from "../roles/index.js";
import {
  MembersRepository,
  type MemberTransaction,
} from "./members.repository.js";

@Injectable()
export class MemberPolicy {
  constructor(
    @Inject(MembersRepository) private readonly repository: MembersRepository,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}
  /** 写锁后重载当前角色，Guard 的旧快照不能作为写操作权限依据。 */
  async actor(
    tx: MemberTransaction,
    actor: IdentityContext,
    required: DeclaredPermissionCode,
  ) {
    const row = await this.repository.find(tx, actor.orgId, actor.identityId);
    if (!row || row.user.id !== actor.userId || row.user.status !== 1)
      throw new ApiException(10005);
    if (row.identity.status !== 1) throw new ApiException(11002);
    const assigned = await this.repository.bindings(tx, actor.identityId);
    const roles = await this.availableRoles(
      tx,
      actor.orgId,
      row.identity.type,
      assigned.map((r) => r.id),
    );
    const roleIds = roles.map((r) => r.id);
    const permissions = new Map(await this.roles.permissions(roleIds, tx));
    if (!permissions.has(required)) throw new ApiException(11101);
    const org = await this.repository.organization(tx, actor.orgId);
    if (org?.status !== 1) throw new ApiException(11003);
    return { ...actor, roleIds, permissions };
  }
  async organization(
    tx: MemberTransaction,
    actor: IdentityContext,
    orgId: string,
    create: boolean,
  ) {
    const target = await this.repository.organization(tx, orgId);
    if (target?.status !== 1) throw new ApiException(90004);
    if (orgId === actor.orgId) return { target, bootstrap: false };
    const assigned = await this.repository.roleRows(tx, actor.roleIds);
    if (
      actor.identityType === "company" &&
      actor.orgType === "company" &&
      assigned.some(
        (r) =>
          r.kind === "preset" &&
          r.code === "company-super-admin" &&
          r.orgId === null,
      )
    )
      return { target, bootstrap: false };
    if (
      create &&
      actor.orgType === "bureau" &&
      target.type === "bureau" &&
      isOrganizationAdministrator(await this.roles.resolve(actor.roleIds, tx))
    ) {
      const own = await this.repository.organization(tx, actor.orgId);
      const parent = await this.repository.regionPath(
        tx,
        own?.regionCode ?? null,
      );
      const child = await this.repository.regionPath(tx, target.regionCode);
      if (parent && child?.startsWith(`${parent}.`))
        return { target, bootstrap: true };
    }
    throw new ApiException(11101);
  }
  async availableRoles(
    tx: MemberTransaction,
    orgId: string,
    type: string,
    ids: string[],
  ) {
    const rows = (await this.repository.roleRows(tx, ids)).filter(
      (row) =>
        row.identityType === type &&
        ((row.kind === "preset" && row.orgId === null) ||
          (row.kind === "custom" && row.orgId === orgId)),
    );
    const bases = await this.repository.roleRows(
      tx,
      rows.flatMap((r) => (r.baseRoleId ? [r.baseRoleId] : [])),
    );
    return rows.filter(
      (r) =>
        r.kind === "preset" ||
        bases.some(
          (base) =>
            base.id === r.baseRoleId &&
            base.kind === "preset" &&
            base.orgId === null &&
            base.identityType === type,
        ),
    );
  }
  async fits(
    tx: MemberTransaction,
    actor: IdentityContext,
    orgId: string,
    type: string,
    ids: string[],
  ) {
    const rows = await this.availableRoles(tx, orgId, type, ids);
    if (rows.length !== ids.length) return false;
    const resolved = await this.roles.resolve(ids, tx);
    return rows.every((row) => {
      const grants = resolved.filter((g) => g.roleId === row.id);
      return withinRoleCeiling(
        grants,
        grants[0]?.scope ?? dataScopeSchema.parse(row.dataScope),
        actor.permissions,
      );
    });
  }
  async assignedRoles(
    tx: MemberTransaction,
    actor: IdentityContext,
    orgId: string,
    type: string,
    ids: string[],
  ) {
    if ((await this.availableRoles(tx, orgId, type, ids)).length !== ids.length)
      throw new ApiException(90004);
    if (!(await this.fits(tx, actor, orgId, type, ids)))
      throw new ApiException(11102);
  }
  async department(tx: MemberTransaction, orgId: string, id: string) {
    const row = await this.repository.department(tx, orgId, id);
    if (!row) throw new ApiException(90004);
    return row;
  }
  async administratorRoles(tx: MemberTransaction, ids: string[]) {
    return isOrganizationAdministrator(await this.roles.resolve(ids, tx));
  }
}
