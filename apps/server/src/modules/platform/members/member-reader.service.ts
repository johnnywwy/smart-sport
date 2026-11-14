import { Inject, Injectable } from "@nestjs/common";
import {
  type IdentityType,
  identityTypeNames,
  type MemberListQuery,
  memberSchema,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import { MemberCredentials } from "../../../infra/crypto/member-credentials.js";
import type { IdentityContext } from "../identity-context/index.js";
import { MemberListRepository } from "./member-list.repository.js";
import { MemberPolicy } from "./member-policy.service.js";
import {
  MembersRepository,
  type MemberTransaction,
} from "./members.repository.js";

export type MemberRow = NonNullable<
  Awaited<ReturnType<MembersRepository["find"]>>
>;
@Injectable()
export class MemberReader {
  constructor(
    @Inject(MembersRepository) private readonly repository: MembersRepository,
    @Inject(MemberListRepository) private readonly lists: MemberListRepository,
    @Inject(MemberPolicy) private readonly policy: MemberPolicy,
    @Inject(MemberCredentials) private readonly credentials: MemberCredentials,
  ) {}
  /** 部门和成员查询始终限制到已验证组织。 */
  list(orgId: string, input: MemberListQuery, actor: IdentityContext) {
    return this.repository.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:member:view");
      const { target } = await this.policy.organization(
        tx,
        actor,
        orgId,
        false,
      );
      const department =
        input.departmentId && input.departmentId !== "unassigned"
          ? await this.policy.department(tx, orgId, input.departmentId)
          : undefined;
      const { rows, total } = await this.lists.list(
        tx,
        orgId,
        input,
        department?.path,
      );
      return {
        items: await Promise.all(
          rows.map((r) => this.row(tx, actor, r, target.name)),
        ),
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }
  read(orgId: string, id: string, actor: IdentityContext) {
    return this.repository.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:member:view");
      const { target } = await this.policy.organization(
        tx,
        actor,
        orgId,
        false,
      );
      return this.detail(
        tx,
        actor,
        await this.find(tx, orgId, id),
        target.name,
      );
    });
  }
  async row(
    tx: MemberTransaction,
    actor: IdentityContext,
    row: MemberRow,
    orgName: string,
  ) {
    const identity = row.identity;
    const assigned = await this.repository.bindings(tx, identity.id);
    const roles = await this.policy.availableRoles(
      tx,
      identity.orgId,
      identity.type,
      assigned.map((r) => r.id),
    );
    const editable =
      actor.permissions.has("org:member:update") &&
      (await this.policy.fits(
        tx,
        actor,
        identity.orgId,
        identity.type,
        roles.map((r) => r.id),
      ));
    return memberSchema.parse({
      id: identity.id,
      userId: row.user.id,
      orgId: identity.orgId,
      orgName,
      identityType: identity.type,
      typeName: identityTypeNames[identity.type as IdentityType],
      username: row.user.username,
      realName: row.user.realName,
      phoneMasked: this.credentials.maskedPhone(row.user.phone),
      departmentId: identity.departmentId,
      departmentName: row.departmentName,
      title: identity.title,
      roles: roles.map((r) => ({ id: r.id, name: r.name, kind: r.kind })),
      status: identity.status,
      accountStatus: row.user.status,
      version: identity.version,
      allowedActions: editable
        ? [
            "update",
            ...(identity.id !== actor.identityId ? ["assignRoles"] : []),
            identity.status === 1 ? "disable" : "enable",
          ]
        : [],
    });
  }
  async find(tx: MemberTransaction, orgId: string, id: string) {
    const row = await this.repository.find(tx, orgId, id);
    if (!row) throw new ApiException(90004);
    return row;
  }
  async detail(
    tx: MemberTransaction,
    actor: IdentityContext,
    row: MemberRow,
    orgName: string,
  ) {
    return {
      ...(await this.row(tx, actor, row, orgName)),
      otherIdentities: (
        await this.lists.otherIdentities(tx, row.user.id, row.identity.orgId)
      ).map((r) => ({
        orgName: r.orgName,
        typeName: identityTypeNames[r.type as IdentityType],
        status: r.status,
      })),
    };
  }
}
