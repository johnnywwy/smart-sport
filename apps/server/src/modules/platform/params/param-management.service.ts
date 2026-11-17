import { Inject, Injectable } from "@nestjs/common";
import {
  type SystemParamQuery,
  systemParamValueSchema,
  type UpdateSystemParam,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { paramResponse } from "./params.mapper.js";
import { ParamsRepository } from "./params.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
@Injectable()
export class ParamManagementService {
  constructor(
    @Inject(ParamsRepository) private readonly repository: ParamsRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  async list(input: SystemParamQuery, actor: IdentityContext) {
    this.authorize(actor, "system:param:view");
    const result = await this.repository.list(input);
    return {
      ...result,
      items: result.items.map((row) => paramResponse(row, actor)),
    };
  }
  async detail(id: string, actor: IdentityContext) {
    this.authorize(actor, "system:param:view");
    const row = await this.repository.byId(id.toLowerCase());
    if (!row) throw new ApiException(90004);
    return paramResponse(row, actor);
  }
  async update(
    id: string,
    input: UpdateSystemParam,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPolicy(tx);
      const fresh = await this.contexts.load(actor.identityId, actor.client);
      if (
        fresh.userId !== actor.userId ||
        fresh.tokenVersion !== actor.tokenVersion
      )
        throw new ApiException(10005);
      this.authorize(fresh, "system:param:update");
      const row = await this.repository.byId(id.toLowerCase(), tx, true);
      if (!row) throw new ApiException(90004);
      if (row.version !== input.version) throw new ApiException(90002);
      const parsed = systemParamValueSchema(row.key).safeParse(input.value);
      if (!parsed.success)
        throw new ApiException(90001, {
          fields: { value: parsed.error.issues.map((i) => i.message) },
        });
      const saved = await this.repository.update(
        tx,
        row,
        parsed.data,
        fresh.identityId,
      );
      await this.repository.audit(tx, {
        userId: fresh.userId,
        identityId: fresh.identityId,
        orgId: fresh.orgId,
        action: "system.param.update",
        targetType: "system_param",
        targetId: row.id,
        changes: {
          key: row.key,
          before: { value: row.value },
          after: { value: saved.value },
          reason: input.reason,
        },
        ...metadata,
        createdAt: new Date(),
      });
      return paramResponse(saved, fresh);
    });
  }
  private authorize(
    actor: IdentityContext,
    permission: "system:param:view" | "system:param:update",
  ) {
    if (actor.identityType !== "company" || !actor.permissions.has(permission))
      throw new ApiException(11101);
  }
}
