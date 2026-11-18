import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { organizations, schoolTenants } from "../../schema/public.js";

/** 补开通只处理未登记或未完成开通的学校，不恢复停用、归档或销毁状态。 */
export class ProvisionRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async candidates() {
    const rows = await this.db
      .select({ schoolId: organizations.id })
      .from(organizations)
      .leftJoin(schoolTenants, eq(schoolTenants.schoolId, organizations.id))
      .where(
        and(
          eq(organizations.type, "school"),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
          isNull(schoolTenants.deletedAt),
          or(
            isNull(schoolTenants.schoolId),
            inArray(schoolTenants.status, ["provisioning", "failed"]),
          ),
        ),
      )
      .orderBy(asc(organizations.id));
    return rows.map((row) => row.schoolId);
  }
}
