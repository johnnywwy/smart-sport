import { Inject, Injectable } from "@nestjs/common";
import type {
  RegionManagementQuery,
  RegionManagementRow,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { RegionManagementRepository } from "./region-management.repository.js";
import { digest, regionSyncPlan } from "./region-sync-plan.js";
import { reviewedRegions } from "./reviewed-regions.js";
@Injectable()
export class RegionManagementService {
  constructor(
    @Inject(RegionManagementRepository)
    private readonly repository: RegionManagementRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  private authorize(actor: IdentityContext, action: "view" | "import") {
    if (
      actor.identityType !== "company" ||
      !actor.permissions.has(`system:region:${action}`)
    )
      throw new ApiException(11101);
  }
  async list(input: RegionManagementQuery, actor: IdentityContext) {
    this.authorize(actor, "view");
    return this.repository.read(async (tx) => {
      const [{ rows }, orgs] = await Promise.all([
        this.repository.snapshot(tx),
        this.repository.organizations(tx),
      ]);
      const byCode = new Map(rows.map((r) => [r.code, r]));
      const items = rows
        .filter(
          (r) =>
            r.status === 1 &&
            (r.parentCode ?? undefined) === input.parent &&
            (!input.keyword || r.name.includes(input.keyword)),
        )
        .sort(
          (a, b) =>
            (a.name.localeCompare(b.name, "zh-CN") ||
              a.code.localeCompare(b.code)) *
            (input.sort === "name:desc" ? -1 : 1),
        );
      return {
        items: items
          .slice((input.page - 1) * input.pageSize, input.page * input.pageSize)
          .map(
            ({ status: _status, ...r }): RegionManagementRow => ({
              ...r,
              parentName: r.parentCode
                ? (byCode.get(r.parentCode)?.name ?? null)
                : null,
              schoolCount: orgs.filter(
                (o) =>
                  o.type === "school" &&
                  (o.code === r.code ||
                    byCode.get(o.code)?.path.startsWith(`${r.path}.`)),
              ).length,
              bureaus: orgs
                .filter((o) => o.type === "bureau" && o.code === r.code)
                .map((o) => ({ name: o.name, status: o.status })),
              allowedActions: ["view"],
            }),
          ),
        allowedActions: actor.permissions.has("system:region:import")
          ? ["import"]
          : [],
        total: items.length,
        page: input.page,
        pageSize: input.pageSize,
      };
    });
  }
  async preview(actor: IdentityContext) {
    this.authorize(actor, "import");
    return this.repository.read(async (tx) => {
      const data = await reviewedRegions(),
        snapshot = await this.repository.snapshot(tx);
      return {
        ...regionSyncPlan(snapshot.rows, data.seeds, snapshot.references),
        source: data.source,
        fingerprint: digest({ data, snapshot }),
        allowedActions: ["import"] as const,
      };
    });
  }
  async confirm(
    fingerprint: string,
    actor: IdentityContext,
    metadata: { traceId: string; ip: string; userAgent: string },
  ) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx);
      const fresh = await this.contexts.load(actor.identityId, actor.client);
      if (
        fresh.userId !== actor.userId ||
        fresh.tokenVersion !== actor.tokenVersion
      )
        throw new ApiException(10005);
      this.authorize(fresh, "import");
      const data = await reviewedRegions(),
        snapshot = await this.repository.snapshot(tx);
      if (digest({ data, snapshot }) !== fingerprint)
        throw new ApiException(90002);
      const plan = regionSyncPlan(
        snapshot.rows,
        data.seeds,
        snapshot.references,
      );
      if (plan.blocked || !plan.changes.length)
        throw new ApiException(90001, {
          fields: {
            _request: [
              plan.blocked
                ? "存在受影响的组织或负责范围，请先处理关联后重新预览"
                : "没有需要同步的变更",
            ],
          },
        });
      await this.repository.apply(tx, data.seeds);
      await this.repository.audit(tx, {
        userId: fresh.userId,
        identityId: fresh.identityId,
        orgId: fresh.orgId,
        action: "system.region.import",
        targetType: "region_catalog",
        targetId: null,
        changes: { source: data.source, changes: plan.changes },
        ...metadata,
        createdAt: new Date(),
      });
      return { applied: plan.changes.length };
    });
  }
}
