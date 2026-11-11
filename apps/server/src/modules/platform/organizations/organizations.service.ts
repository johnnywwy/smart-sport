import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateOrganizationRequest,
  Organization,
  OrganizationListQuery,
  ToggleOrganizationRequest,
  UpdateOrganizationRequest,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import type { CompanyOrganizationRequest } from "./company-organization.guard.js";
import { OrganizationsRepository } from "./organizations.repository.js";

type Actor = NonNullable<CompanyOrganizationRequest["companyActor"]>;
type Metadata = {
  traceId: string;
  ip: string;
  userAgent: string;
};

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(OrganizationsRepository)
    private readonly organizations: OrganizationsRepository,
  ) {}

  async list(query: OrganizationListQuery) {
    const result = await this.organizations.list(query);
    return {
      items: result.items.map((row) => this.toContract(row)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  create(input: CreateOrganizationRequest, actor: Actor, metadata: Metadata) {
    return this.organizations.transaction(async (tx) => {
      const regionName = await this.ensureRegion(
        input.type,
        input.regionCode ?? null,
        tx,
      );
      const id = v7();
      const [created] = await this.organizations.create(tx, {
        id,
        type: input.type,
        name: input.name,
        code: `ORG_${id.replaceAll("-", "")}`,
        regionCode: input.regionCode ?? null,
        createdBy: actor.identityId,
        updatedBy: actor.identityId,
      });
      if (!created) throw new Error("组织创建后未返回数据");
      await this.organizations.audit(tx, {
        actor,
        action: "organization.create",
        targetId: created.id,
        changes: {
          type: [null, created.type],
          name: [null, created.name],
          regionCode: [null, created.regionCode],
        },
        ...metadata,
      });
      return this.toContract({
        ...created,
        regionName,
      });
    });
  }

  update(
    id: string,
    input: UpdateOrganizationRequest,
    actor: Actor,
    metadata: Metadata,
  ) {
    return this.organizations.transaction(async (tx) => {
      const current = await this.organizations.findById(tx, id, true);
      this.ensureManageable(current);
      const regionName = await this.ensureRegion(
        current.type,
        input.regionCode,
        tx,
      );
      const updated = await this.organizations.update(tx, {
        id,
        version: input.version,
        actorId: actor.identityId,
        changes: { name: input.name, regionCode: input.regionCode },
      });
      if (!updated) throw new ApiException(90002);
      await this.organizations.audit(tx, {
        actor,
        action: "organization.update",
        targetId: id,
        changes: {
          name: [current.name, updated.name],
          regionCode: [current.regionCode, updated.regionCode],
        },
        ...metadata,
      });
      return this.toContract({
        ...updated,
        regionName,
      });
    });
  }

  toggle(
    id: string,
    input: ToggleOrganizationRequest,
    actor: Actor,
    metadata: Metadata,
  ) {
    return this.organizations.transaction(async (tx) => {
      const current = await this.organizations.findById(tx, id, true);
      this.ensureManageable(current);
      const status = input.enabled ? 1 : 0;
      const updated = await this.organizations.update(tx, {
        id,
        version: input.version,
        actorId: actor.identityId,
        changes: { status },
      });
      if (!updated) throw new ApiException(90002);
      await this.organizations.audit(tx, {
        actor,
        action: "organization.toggle",
        targetId: id,
        changes: { status: [current.status, updated.status] },
        ...metadata,
      });
      return this.toContract({
        ...updated,
        regionName: updated.regionCode
          ? ((
              await this.organizations.findEnabledRegion(updated.regionCode, tx)
            )?.name ?? null)
          : null,
      });
    });
  }

  private async ensureRegion(
    type: string,
    regionCode: string | null,
    tx: Parameters<Parameters<OrganizationsRepository["transaction"]>[0]>[0],
  ) {
    if (type === "bureau" && !regionCode) {
      throw new ApiException(90001, {
        fields: { regionCode: ["教育局必须选择管辖区划"] },
      });
    }
    if (!regionCode) return null;
    const region = await this.organizations.findEnabledRegion(regionCode, tx);
    if (!region) {
      throw new ApiException(90001, {
        fields: { regionCode: ["区划不存在或已停用"] },
      });
    }
    return region.name;
  }

  private ensureManageable(
    organization:
      | Awaited<ReturnType<OrganizationsRepository["findById"]>>
      | undefined,
  ): asserts organization is NonNullable<typeof organization> {
    if (
      !organization ||
      (organization.type !== "bureau" && organization.type !== "agent")
    ) {
      throw new ApiException(90004);
    }
  }

  private toContract(row: {
    id: string;
    type: string;
    name: string;
    regionCode: string | null;
    regionName: string | null;
    status: number;
    version: number;
  }): Organization {
    return {
      id: row.id,
      type: row.type as Organization["type"],
      name: row.name,
      regionCode: row.regionCode,
      regionName: row.regionName,
      status: row.status as Organization["status"],
      version: row.version,
      allowedActions:
        row.type === "bureau" || row.type === "agent"
          ? ["update", "toggle"]
          : [],
    };
  }
}
