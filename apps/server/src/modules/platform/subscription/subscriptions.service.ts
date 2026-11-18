import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  appDefinitions,
  type DeclaredPermissionCode,
  type SubscriptionQuery,
  subscriptionDetailSchema,
  subscriptionsSchema,
} from "@smart-sport/contracts";
import { shanghaiDate } from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { ScopeService } from "../scope/index.js";
import {
  schoolAppResponse,
  subscriptionResponse,
} from "./subscription.mapper.js";
import { SubscriptionRepository } from "./subscription.repository.js";
import { SubscriptionStateService } from "./subscription-state.service.js";
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(SubscriptionRepository)
    private readonly repository: SubscriptionRepository,
    @Inject(SubscriptionStateService)
    private readonly state: SubscriptionStateService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  list(actor: IdentityContext, query: SubscriptionQuery) {
    return this.stable(actor, async (fresh) => {
      this.platform(fresh);
      const scope = await this.scopes.resolve(
        fresh.identityId,
        "platform:subscription:view",
      );
      const today = shanghaiDate(new Date());
      const { rows, total } = await this.repository.list(scope, query, today);
      const items = await Promise.all(
        rows.map(async ({ subscription, schoolName }) =>
          subscriptionResponse(
            subscription,
            schoolName,
            subscription.salesIdentityId
              ? ((
                  await this.repository.salesIdentity(
                    subscription.salesIdentityId,
                  )
                )?.name ?? null)
              : null,
            today,
          ),
        ),
      );
      return subscriptionsSchema.parse({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    });
  }
  detail(actor: IdentityContext, schoolId: string) {
    schoolId = schoolId.toLowerCase();
    return this.stable(actor, async (fresh) => {
      this.platform(fresh);
      await this.scopes.requireSchool(
        fresh.identityId,
        "platform:subscription:view",
        schoolId,
      );
      const school = await this.repository.school(schoolId);
      const { subscription, apps } = await this.repository.snapshot(schoolId);
      if (!school || !subscription) throw new ApiException(90004);
      const salesName = subscription.salesIdentityId
        ? ((await this.repository.salesIdentity(subscription.salesIdentityId))
            ?.name ?? null)
        : null;
      const history = await this.repository.history(schoolId);
      return subscriptionDetailSchema.parse({
        ...subscriptionResponse(
          subscription,
          school.name,
          salesName,
          shanghaiDate(new Date()),
        ),
        apps: apps.map(schoolAppResponse),
        history: history.map((row) => ({
          ...row,
          serviceStart: shanghaiDate(row.serviceStart),
          serviceEnd: shanghaiDate(row.serviceEnd),
          createdAt: row.createdAt.toISOString(),
        })),
      });
    });
  }
  schoolApps(actor: IdentityContext, schoolId: string) {
    schoolId = schoolId.toLowerCase();
    return this.stable(actor, async (fresh) => {
      if (fresh.orgType === "school") {
        if (fresh.orgId !== schoolId) throw new ApiException(90004);
      } else {
        if (!["company", "bureau"].includes(fresh.identityType))
          throw new ApiException(90004);
        let visible = false;
        const schoolPermissions = appDefinitions
          .filter((app) => app.code === "school")
          .flatMap((app) =>
            Object.entries(app.features).map(
              ([feature]) => `school:${feature}:view` as DeclaredPermissionCode,
            ),
          );
        for (const permission of schoolPermissions)
          if (fresh.permissions.has(permission)) {
            try {
              await this.scopes.requireSchool(
                fresh.identityId,
                permission,
                schoolId,
              );
              visible = true;
              break;
            } catch (error) {
              if (!(error instanceof ApiException && error.code === 90004))
                throw error;
            }
          }
        if (!visible) throw new ApiException(90004);
      }
      if (!(await this.repository.school(schoolId)))
        throw new ApiException(90004);
      return this.state.apps(schoolId, fresh);
    });
  }
  private platform(actor: IdentityContext) {
    if (
      actor.identityType !== "company" ||
      !actor.permissions.has("platform:subscription:view")
    )
      throw new ApiException(11101);
  }
  private async stable<T>(
    actor: IdentityContext,
    read: (fresh: IdentityContext) => Promise<T>,
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { context, revision } = await this.contexts.loadSnapshot(
        actor.identityId,
        actor.client,
      );
      try {
        const result = await read(context);
        if (await this.contexts.isCurrent(revision)) return result;
      } catch (error) {
        if (await this.contexts.isCurrent(revision)) throw error;
      }
    }
    throw new ServiceUnavailableException("学校服务正在变更，请重试");
  }
}
