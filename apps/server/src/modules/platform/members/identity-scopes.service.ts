import { Inject, Injectable } from "@nestjs/common";
import {
  type ExtraScope,
  identityScopesSchema,
  type SetIdentityScopes,
  setIdentityScopesSchema,
} from "@smart-sport/contracts";
import { ApiException, invalidRequest } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { IdentityScopesRepository } from "./identity-scopes.repository.js";
import { MemberPolicy } from "./member-policy.service.js";
import {
  MembersRepository,
  type MemberTransaction,
} from "./members.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };

@Injectable()
export class IdentityScopesService {
  constructor(
    @Inject(MembersRepository) private readonly members: MembersRepository,
    @Inject(MemberPolicy) private readonly policy: MemberPolicy,
    @Inject(IdentityScopesRepository)
    private readonly repository: IdentityScopesRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}

  /** 与成员编辑共用写锁和身份版本，边界校验、整体替换与审计原子提交。 */
  async set(
    orgId: string,
    id: string,
    input: SetIdentityScopes,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    id = id.toLowerCase();
    const result = await this.members.transaction(async (tx) => {
      actor = await this.policy.actor(tx, actor, "org:member:update");
      await this.policy.organization(tx, actor, orgId, false);
      const organization = await this.members.organization(tx, orgId, true);
      if (organization?.status !== 1) throw new ApiException(90004);
      const candidate = await this.members.find(tx, orgId, id);
      if (!candidate) throw new ApiException(90004);
      await this.members.lockAccount(tx, candidate.user.id);
      const target = await this.members.find(tx, orgId, id, true);
      if (!target) throw new ApiException(90004);
      const assigned = await this.members.bindings(tx, id);
      const roles = await this.policy.availableRoles(
        tx,
        orgId,
        target.identity.type,
        assigned.map((r) => r.id),
      );
      if (
        !(await this.policy.fits(
          tx,
          actor,
          orgId,
          target.identity.type,
          roles.map((r) => r.id),
        ))
      )
        throw new ApiException(11102);
      if (target.identity.version !== input.version)
        throw new ApiException(90002);
      // UUID 标识不区分大小写，存储及重复校验都使用数据库的规范形式。
      const normalized = setIdentityScopesSchema.safeParse({
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
      await this.validate(tx, organization, target.identity.type, input.scopes);
      const before = await this.repository.read(tx, id);
      const updated = await this.repository.bump(
        tx,
        orgId,
        id,
        input.version,
        actor.identityId,
      );
      await this.repository.replace(tx, id, input.scopes);
      const after = await this.repository.read(tx, id);
      await this.members.audit(tx, {
        userId: actor.userId,
        identityId: actor.identityId,
        orgId,
        targetType: "identity",
        targetId: id,
        action: "identity.scopes.update",
        changes: { scopes: [before, after] },
        ...metadata,
        createdAt: new Date(),
      });
      return identityScopesSchema.parse({
        identityId: id,
        version: updated.version,
        scopes: after,
      });
    });
    await this.contexts.invalidate([id]);
    return result;
  }

  private async validate(
    tx: MemberTransaction,
    organization: { type: string; regionCode: string | null },
    identityType: string,
    scopes: ExtraScope[],
  ) {
    if (!scopes.length) return;
    if (
      !["company", "bureau"].includes(identityType) ||
      identityType !== organization.type ||
      scopes.some((s) => s.type !== "school" && s.type !== "region")
    )
      throw new ApiException(12004);
    let boundary: string | undefined;
    if (organization.type === "bureau") {
      const own = await this.repository.regionRows(
        tx,
        organization.regionCode ? [organization.regionCode] : [],
      );
      boundary = own[0]?.path;
      if (!boundary) throw new ApiException(90004);
    }
    const regions = await this.repository.regionRows(
      tx,
      scopes.filter((s) => s.type === "region").map((s) => s.value),
    );
    const schools = await this.repository.schoolRows(
      tx,
      scopes.filter((s) => s.type === "school").map((s) => s.value),
    );
    if (
      regions.length + schools.length !== scopes.length ||
      [...regions, ...schools].some(
        (r) =>
          boundary !== undefined &&
          r.path !== boundary &&
          !r.path.startsWith(`${boundary}.`),
      )
    )
      throw new ApiException(90004);
  }
}
