import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../database/registry.js";
import {
  organizations,
  schoolTenants,
  tenantRegistryRevision,
} from "../../schema/public.js";

@Injectable()
export class TenantRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async migrationCandidates() {
    const rows = await this.db
      .select({ schoolId: schoolTenants.schoolId })
      .from(schoolTenants)
      .innerJoin(organizations, eq(organizations.id, schoolTenants.schoolId))
      .where(
        and(
          inArray(schoolTenants.status, ["active", "failed"]),
          isNull(schoolTenants.deletedAt),
          eq(organizations.type, "school"),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
        ),
      )
      .orderBy(asc(schoolTenants.schoolId));
    return rows.map((row) => row.schoolId);
  }

  async revision() {
    const [row] = await this.db
      .select({ version: tenantRegistryRevision.version })
      .from(tenantRegistryRevision)
      .where(eq(tenantRegistryRevision.singleton, true));
    if (!row) throw new Error("学校库登记版本缺失");
    return row.version.toString();
  }

  async snapshot(schoolId: string) {
    // 登记与版本必须来自同一个快照，避免并发停用被缓存到新版本下。
    const [row] = await this.db
      .select({
        tenant: schoolTenants,
        revision: tenantRegistryRevision.version,
      })
      .from(schoolTenants)
      .innerJoin(organizations, eq(organizations.id, schoolTenants.schoolId))
      .innerJoin(
        tenantRegistryRevision,
        eq(tenantRegistryRevision.singleton, true),
      )
      .where(
        and(
          eq(schoolTenants.schoolId, schoolId),
          isNull(schoolTenants.deletedAt),
          eq(organizations.type, "school"),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
        ),
      )
      .limit(1);
    return row
      ? { tenant: row.tenant, revision: row.revision.toString() }
      : undefined;
  }
}
