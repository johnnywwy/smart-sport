import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateMember,
  DeclaredPermissionCode,
  MemberListQuery,
  SetMemberStatus,
  UpdateMember,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { AdministratorService } from "../roles/index.js";
import { MemberAccountService } from "./member-account.service.js";
import { MemberPolicy } from "./member-policy.service.js";
import { MemberReader } from "./member-reader.service.js";
import {
  MembersRepository,
  type MemberTransaction,
} from "./members.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };

@Injectable()
export class MembersService {
  constructor(
    @Inject(MembersRepository) private readonly repository: MembersRepository,
    @Inject(MemberPolicy) private readonly policy: MemberPolicy,
    @Inject(MemberReader) private readonly reader: MemberReader,
    @Inject(MemberAccountService)
    private readonly accounts: MemberAccountService,
    @Inject(AdministratorService)
    private readonly administrators: AdministratorService,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  /** 幂等重放前验证组织选择；首个教育局管理员资格在写事务中再次检查。 */
  resolveOrganization(
    actor: IdentityContext,
    orgId: string,
    create: boolean,
    permission: DeclaredPermissionCode,
  ) {
    return this.repository.transaction(async (tx) => {
      const fresh = await this.policy.actor(tx, actor, permission);
      await this.policy.organization(tx, fresh, orgId, create);
      return orgId;
    });
  }
  list(orgId: string, input: MemberListQuery, actor: IdentityContext) {
    return this.reader.list(orgId, input, actor);
  }
  detail(orgId: string, id: string, actor: IdentityContext) {
    return this.reader.read(orgId, id, actor);
  }
  /** 账号、组织身份、角色与审计原子创建，重复身份不修改原账号。 */
  async create(
    orgId: string,
    input: CreateMember,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:member:create");
      const { target, bootstrap } = await this.policy.organization(
        tx,
        actor,
        orgId,
        true,
      );
      const protectedOrgs = await this.administrators.beforeMemberChange(tx, [
        orgId,
      ]);
      if (
        bootstrap &&
        (protectedOrgs.length ||
          !(await this.policy.administratorRoles(tx, input.roleIds)))
      )
        throw new ApiException(11101);
      await this.lockOrganization(tx, orgId);
      await this.policy.assignedRoles(
        tx,
        actor,
        orgId,
        target.type,
        input.roleIds,
      );
      if (input.departmentId)
        await this.policy.department(tx, orgId, input.departmentId);
      const account = await this.accounts.resolve(
        tx,
        input.account,
        actor.identityId,
      );
      const identity = await this.repository.insertIdentity(tx, {
        id: v7(),
        userId: account.user.id,
        orgId,
        type: target.type,
        departmentId: input.departmentId,
        title: input.title,
        createdBy: actor.identityId,
        updatedBy: actor.identityId,
      });
      if (!identity) throw new ApiException(12009);
      await this.repository.replaceRoles(tx, identity.id, input.roleIds);
      await this.administrators.assertRetained(tx, protectedOrgs);
      await this.audit(
        tx,
        actor,
        orgId,
        identity.id,
        "member.create",
        metadata,
        {
          accountCreated: account.accountCreated,
          userId: account.user.id,
          departmentId: input.departmentId,
          roleIds: input.roleIds,
          title: input.title,
        },
      );
      return {
        member: await this.reader.row(
          tx,
          actor,
          await this.reader.find(tx, orgId, identity.id),
          target.name,
        ),
        accountCreated: account.accountCreated,
        initialPassword: account.initialPassword,
      };
    });
    await this.contexts.invalidate();
    return result;
  }
  /** 调整当前组织身份，自己的角色集合不可变，其他组织身份保持原值。 */
  update(
    orgId: string,
    id: string,
    input: UpdateMember,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.change(orgId, id, input, actor, metadata);
  }
  /** 仅启停身份；不更新共享账号，也不吊销该账号其他组织的会话。 */
  status(
    orgId: string,
    id: string,
    input: SetMemberStatus,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.change(orgId, id, input, actor, metadata);
  }
  private async change(
    orgId: string,
    id: string,
    input: UpdateMember | SetMemberStatus,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    const result = await this.repository.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:member:update");
      const { target } = await this.policy.organization(
        tx,
        actor,
        orgId,
        false,
      );
      const protectedOrgs = await this.administrators.beforeMemberChange(tx, [
        orgId,
      ]);
      await this.lockOrganization(tx, orgId);
      const candidate = await this.reader.find(tx, orgId, id);
      await this.repository.lockAccount(tx, candidate.user.id);
      const current = await this.repository.find(tx, orgId, id, true);
      if (!current) throw new ApiException(90004);
      if (current.identity.version !== input.version)
        throw new ApiException(90002);
      const bindings = (await this.repository.bindings(tx, id)).map(
        (r) => r.id,
      );
      const currentRoles = await this.policy.availableRoles(
        tx,
        orgId,
        current.identity.type,
        bindings,
      );
      if (
        !(await this.policy.fits(
          tx,
          actor,
          orgId,
          current.identity.type,
          currentRoles.map((r) => r.id),
        ))
      )
        throw new ApiException(11102);
      if ("roleIds" in input && input.roleIds !== undefined) {
        if (
          id === actor.identityId &&
          (bindings.length !== input.roleIds.length ||
            bindings.some((r) => !input.roleIds?.includes(r)))
        )
          throw new ApiException(11103);
        await this.policy.assignedRoles(
          tx,
          actor,
          orgId,
          current.identity.type,
          input.roleIds,
        );
      }
      if ("departmentId" in input && input.departmentId)
        await this.policy.department(tx, orgId, input.departmentId);
      const changes =
        "status" in input
          ? { status: input.status }
          : {
              ...(input.departmentId !== undefined
                ? { departmentId: input.departmentId }
                : {}),
              ...(input.title !== undefined ? { title: input.title } : {}),
            };
      const updated = await this.repository.update(
        tx,
        current.identity,
        input.version,
        actor.identityId,
        changes,
      );
      if (!updated) throw new ApiException(90002);
      if ("roleIds" in input && input.roleIds !== undefined)
        await this.repository.replaceRoles(tx, id, input.roleIds);
      await this.administrators.assertRetained(tx, protectedOrgs);
      if ("status" in input && input.status === 0)
        await this.repository.revokeSessions(tx, id);
      await this.audit(
        tx,
        actor,
        orgId,
        id,
        "status" in input ? "member.status" : "member.update",
        metadata,
        {
          before: {
            departmentId: current.identity.departmentId,
            title: current.identity.title,
            status: current.identity.status,
            roleIds: bindings,
          },
          after: {
            departmentId: updated.departmentId,
            title: updated.title,
            status: updated.status,
            roleIds:
              "roleIds" in input ? (input.roleIds ?? bindings) : bindings,
          },
        },
      );
      return this.reader.row(
        tx,
        actor,
        await this.reader.find(tx, orgId, id),
        target.name,
      );
    });
    await this.contexts.invalidate();
    return result;
  }
  private async lockOrganization(tx: MemberTransaction, orgId: string) {
    const row = await this.repository.organization(tx, orgId, true);
    if (row?.status !== 1) throw new ApiException(90004);
  }
  private audit(
    tx: MemberTransaction,
    actor: IdentityContext,
    orgId: string,
    id: string,
    action: string,
    metadata: Metadata,
    changes: Record<string, unknown>,
  ) {
    return this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId,
      targetType: "identity",
      targetId: id,
      action,
      changes,
      ...metadata,
      createdAt: new Date(),
    });
  }
}
