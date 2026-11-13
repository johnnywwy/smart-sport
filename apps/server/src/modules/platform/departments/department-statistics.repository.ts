import { Inject, Injectable } from "@nestjs/common";
import { and, count, countDistinct, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  departmentScopes,
  departments,
  identities,
  organizations,
} from "../../../schema/public.js";
import type { DepartmentTransaction } from "./departments.repository.js";

@Injectable()
export class DepartmentStatisticsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  memberCounts(tx: DepartmentTransaction, orgId: string) {
    return tx
      .select({
        departmentId: identities.departmentId,
        count: countDistinct(identities.userId),
      })
      .from(identities)
      .where(and(eq(identities.orgId, orgId), isNull(identities.deletedAt)))
      .groupBy(identities.departmentId);
  }
  scopeCounts(tx: DepartmentTransaction, orgId: string) {
    return tx
      .select({
        departmentId: departmentScopes.departmentId,
        type: departmentScopes.scopeType,
        count: count(),
      })
      .from(departmentScopes)
      .innerJoin(departments, eq(departments.id, departmentScopes.departmentId))
      .where(and(eq(departments.orgId, orgId), isNull(departments.deletedAt)))
      .groupBy(departmentScopes.departmentId, departmentScopes.scopeType);
  }
  companies() {
    return this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(eq(organizations.type, "company"), isNull(organizations.deletedAt)),
      );
  }
}
