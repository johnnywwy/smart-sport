import { Inject, Injectable } from "@nestjs/common";
import { dataScopeSchema, memberOptionsSchema } from "@smart-sport/contracts";
import { withinRoleCeiling } from "@smart-sport/domain";
import type { IdentityContext } from "../identity-context/index.js";
import { RolesService } from "../roles/index.js";
import { MemberPolicy } from "./member-policy.service.js";
import { MembersRepository } from "./members.repository.js";

@Injectable()
export class MemberOptionsService {
  constructor(
    @Inject(MembersRepository) private readonly repository: MembersRepository,
    @Inject(MemberPolicy) private readonly policy: MemberPolicy,
    @Inject(RolesService) private readonly roles: RolesService,
  ) {}
  /** 选项只包含本组织部门和当前人能够授予的最终角色。 */
  read(orgId: string, actor: IdentityContext) {
    return this.repository.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:member:view");
      const { target } = await this.policy.organization(
        tx,
        actor,
        orgId,
        false,
      );
      const editable =
        actor.permissions.has("org:member:create") ||
        actor.permissions.has("org:member:update");
      const types =
        target.type === "school" ? ["school", "teacher"] : [target.type];
      const candidates = editable
        ? await this.repository.organizationRoles(tx, orgId, types)
        : [];
      const available = (
        await Promise.all(
          types.map((type) =>
            this.policy.availableRoles(
              tx,
              orgId,
              type,
              candidates
                .filter((r) => r.identityType === type)
                .map((r) => r.id),
            ),
          ),
        )
      ).flat();
      const grants = await this.roles.resolve(
        available.map((r) => r.id),
        tx,
      );
      return memberOptionsSchema.parse({
        allowedActions: actor.permissions.has("org:member:create")
          ? ["create"]
          : [],
        departments: await this.repository.departmentOptions(tx, orgId),
        roles: available.flatMap((row) => {
          const values = grants.filter((g) => g.roleId === row.id);
          const dataScope =
            values[0]?.scope ?? dataScopeSchema.parse(row.dataScope);
          if (!withinRoleCeiling(values, dataScope, actor.permissions))
            return [];
          return [
            {
              id: row.id,
              name: row.name,
              kind: row.kind,
              identityType: row.identityType,
              dataScope,
              remark: row.remark,
              grants: values.map(({ app, feature, grant }) => ({
                app,
                feature,
                grant,
              })),
            },
          ];
        }),
      });
    });
  }
}
