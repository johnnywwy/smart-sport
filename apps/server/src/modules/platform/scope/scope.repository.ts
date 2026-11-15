import { Inject, Injectable } from "@nestjs/common";
import { and, eq, exists, inArray, isNull, like, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import { DRIZZLE } from "../../../database/registry.js";
import {
  departmentScopes,
  departments,
  identityScopes,
  organizations,
  regions,
} from "../../../schema/public.js";

type Selection = { schoolIds: string[]; regionCodes: string[] };
/** 范围摘要可以与配置写入共用同一数据库事务。 */
export type ScopeReadDatabase = Pick<NodePgDatabase, "select">;

@Injectable()
export class ScopeRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async organization(orgId: string, db: ScopeReadDatabase = this.db) {
    return (
      await db
        .select({
          type: organizations.type,
          regionPath: regions.path,
          regionStatus: regions.status,
        })
        .from(organizations)
        .leftJoin(regions, eq(regions.code, organizations.regionCode))
        .where(
          and(
            eq(organizations.id, orgId),
            eq(organizations.status, 1),
            isNull(organizations.deletedAt),
          ),
        )
    )[0];
  }
  async department(orgId: string, id: string) {
    return (
      await this.db
        .select({ id: departments.id, path: departments.path })
        .from(departments)
        .where(
          and(
            eq(departments.id, id),
            eq(departments.orgId, orgId),
            isNull(departments.deletedAt),
          ),
        )
    )[0];
  }
  departmentSelections(orgId: string, path: string, below: boolean) {
    return this.db
      .select({
        type: departmentScopes.scopeType,
        value: departmentScopes.scopeValue,
      })
      .from(departmentScopes)
      .innerJoin(departments, eq(departments.id, departmentScopes.departmentId))
      .where(
        and(
          eq(departments.orgId, orgId),
          isNull(departments.deletedAt),
          below
            ? or(
                eq(departments.path, path),
                like(departments.path, `${path}.%`),
              )
            : eq(departments.path, path),
        ),
      );
  }
  async personalSelections(identityId: string) {
    return this.db
      .select({
        type: identityScopes.scopeType,
        value: identityScopes.scopeValue,
      })
      .from(identityScopes)
      .where(eq(identityScopes.identityId, identityId));
  }
  schools(
    boundary: string | undefined,
    selection?: Selection,
    id?: string,
    db: ScopeReadDatabase = this.db,
  ) {
    const selected = alias(regions, "selected_region");
    const regionSelection = selection?.regionCodes.length
      ? exists(
          db
            .select({ one: sql`1` })
            .from(selected)
            .where(
              and(
                inArray(selected.code, selection.regionCodes),
                eq(selected.status, 1),
                or(
                  eq(regions.path, selected.path),
                  sql`${regions.path} LIKE ${selected.path} || '.%'`,
                ),
              ),
            ),
        )
      : undefined;
    const schoolSelection = selection?.schoolIds.length
      ? inArray(organizations.id, selection.schoolIds)
      : undefined;
    return db
      .select({ id: organizations.id })
      .from(organizations)
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(
        and(
          eq(organizations.type, "school"),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
          eq(regions.status, 1),
          id ? eq(organizations.id, id) : undefined,
          boundary
            ? or(
                eq(regions.path, boundary),
                like(regions.path, `${boundary}.%`),
              )
            : undefined,
          selection
            ? (or(schoolSelection, regionSelection) ?? sql`false`)
            : undefined,
        ),
      )
      .orderBy(organizations.id);
  }
}
