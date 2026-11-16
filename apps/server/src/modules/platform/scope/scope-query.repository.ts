import { Inject, Injectable } from "@nestjs/common";
import type { ScopeSchoolsQuery, VisibleScope } from "@smart-sport/contracts";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  identities,
  organizations,
  regions,
  roles,
  users,
} from "../../../schema/public.js";

@Injectable()
export class ScopeQueryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  async identity(orgId: string, id: string) {
    return (
      await this.db
        .select({ id: identities.id })
        .from(identities)
        .innerJoin(users, eq(users.id, identities.userId))
        .where(
          and(
            eq(identities.id, id),
            eq(identities.orgId, orgId),
            eq(identities.status, 1),
            isNull(identities.deletedAt),
            eq(users.status, 1),
            isNull(users.deletedAt),
          ),
        )
    )[0];
  }
  roleRows(orgId: string, type: string, ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(
        and(
          inArray(roles.id, ids),
          eq(roles.identityType, type),
          eq(roles.status, 1),
          isNull(roles.deletedAt),
          or(
            and(eq(roles.kind, "preset"), isNull(roles.orgId)),
            and(eq(roles.kind, "custom"), eq(roles.orgId, orgId)),
          ),
        ),
      );
  }
  async schools(scope: VisibleScope, input: ScopeSchoolsQuery) {
    const ids = scope.kind === "schools" ? scope.schoolIds : [];
    const keyword = input.keyword?.replace(/[\\%_]/g, "\\$&");
    const where = and(
      eq(organizations.type, "school"),
      eq(organizations.status, 1),
      isNull(organizations.deletedAt),
      eq(regions.status, 1),
      scope.kind === "all-schools"
        ? undefined
        : ids.length
          ? inArray(organizations.id, ids)
          : sql`false`,
      keyword ? sql`${organizations.name} ILIKE ${`%${keyword}%`}` : undefined,
    );
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        regionName: regions.name,
      })
      .from(organizations)
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(where)
      .orderBy(asc(organizations.name), asc(organizations.id))
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize);
    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(organizations)
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(where);
    return {
      items: rows,
      total: count?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async validSelection(selections: { type: string; value: string }[]) {
    // 只返回匹配的值/路径，不回传组织边界之外的名称。
    const schoolIds = selections
      .filter((s) => s.type === "school")
      .map((s) => s.value);
    const regionCodes = selections
      .filter((s) => s.type === "region")
      .map((s) => s.value);
    const schoolRows = schoolIds.length
      ? await this.db
          .select({ value: organizations.id, path: regions.path })
          .from(organizations)
          .innerJoin(regions, eq(regions.code, organizations.regionCode))
          .where(
            and(
              inArray(organizations.id, schoolIds),
              eq(organizations.type, "school"),
              eq(organizations.status, 1),
              isNull(organizations.deletedAt),
              eq(regions.status, 1),
            ),
          )
      : [];
    const regionRows = regionCodes.length
      ? await this.db
          .select({ value: regions.code, path: regions.path })
          .from(regions)
          .where(and(inArray(regions.code, regionCodes), eq(regions.status, 1)))
      : [];
    return [...schoolRows, ...regionRows];
  }
}
