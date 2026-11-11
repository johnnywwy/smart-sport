import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  appDefinitions,
  dataScopeSchema,
  identityTypeSchema,
  idSchema,
  organizationTypeSchema,
} from "@smart-sport/contracts";
import { mergePermissions } from "@smart-sport/domain";
import { z } from "zod";
import { ApiException } from "../../../api-response.js";
import { SERVER_CONFIG } from "../../../server-config.js";
import { RolesService } from "../roles/index.js";
import { ContextRepository } from "./context.repository.js";
import { ContextCache } from "./context-cache.js";

const contextSchema = z.object({
  userId: idSchema,
  identityId: idSchema,
  tokenVersion: z.int().nonnegative(),
  identityType: identityTypeSchema,
  orgId: idSchema,
  orgType: organizationTypeSchema,
  departmentId: idSchema.nullable(),
  roleIds: z.array(idSchema),
  permissions: z.array(z.tuple([z.string(), dataScopeSchema])),
});
export type IdentityContext = Omit<
  z.infer<typeof contextSchema>,
  "permissions"
> & {
  client: "admin" | "mobile";
  permissions: Map<string, z.infer<typeof dataScopeSchema>>;
};

@Injectable()
export class IdentityContextService {
  private readonly cache: ContextCache;

  constructor(
    @Inject(ContextRepository) private readonly repository: ContextRepository,
    @Inject(RolesService) private readonly roles: RolesService,
    @Inject(SERVER_CONFIG) config: ServerConfig,
  ) {
    this.cache = new ContextCache(config.REDIS_URL);
  }

  onModuleInit() {
    return this.cache.subscribe();
  }
  onApplicationShutdown() {
    return this.cache.close();
  }

  /** 数据变更提交后调用；角色、部门和账号变更可整体失效，身份变更可指定 id。 */
  invalidate(identityIds: string[] = []) {
    return this.cache.invalidate(identityIds);
  }

  async load(
    identityId: string,
    client: "admin" | "mobile" = "admin",
  ): Promise<IdentityContext> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dbRevision = await this.repository.revision();
      await this.cache.observeDatabaseRevision(dbRevision);
      const revision = `${dbRevision}:${await this.cache.revision()}`;
      const cached = contextSchema.safeParse(
        await this.cache.read(identityId, revision),
      );
      const context = cached.success
        ? cached.data
        : await this.build(identityId);
      if (
        !cached.success &&
        !(await this.cache.write(identityId, revision, context))
      )
        continue;
      if (
        revision !==
        `${await this.repository.revision()}:${await this.cache.revision()}`
      )
        continue;
      if (
        client === "admin" &&
        ["student", "parent"].includes(context.identityType)
      )
        throw new ApiException(11004);
      return { ...context, client, permissions: new Map(context.permissions) };
    }
    throw new ServiceUnavailableException("身份正在变更，请重试");
  }

  private async build(identityId: string) {
    const row = await this.repository.identity(identityId);
    if (!row) throw new ApiException(11001);
    const { identity, organization, user } = row;
    if (user.deletedAt || user.status !== 1) throw new ApiException(10005);
    if (identity.status !== 1) throw new ApiException(11002);
    if (organization.deletedAt || organization.status !== 1)
      throw new ApiException(11003);
    const expected = ["teacher", "student", "parent"].includes(identity.type)
      ? "school"
      : identity.type;
    if (organization.type !== expected) throw new ApiException(11004);
    const roleIds = (await this.repository.roleIds(identityId)).map(
      ({ id }) => id,
    );
    const grants = await this.roles.resolve(roleIds);
    const definitions = appDefinitions.flatMap((app) =>
      Object.entries(app.features).map(([feature, definition]) => ({
        app: app.code,
        feature,
        actions: [...definition.actions],
      })),
    );
    const permissions = mergePermissions(
      grants.flatMap((entry) => {
        const feature = definitions.find(
          (definition) =>
            definition.app === entry.app &&
            definition.feature === entry.feature,
        );
        return feature
          ? [{ feature, grant: entry.grant, scope: entry.scope }]
          : [];
      }),
    );
    return contextSchema.parse({
      userId: user.id,
      identityId: identity.id,
      tokenVersion: user.tokenVersion,
      identityType: identity.type,
      orgId: organization.id,
      orgType: organization.type,
      departmentId: identity.departmentId,
      roleIds,
      permissions: [...permissions],
    });
  }
}
