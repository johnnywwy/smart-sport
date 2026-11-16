import { Injectable } from "@nestjs/common";
import { and, count, eq, ilike, inArray, isNull, like, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { organizations, regions } from "../../../schema/public.js";
export type CandidateDatabase = Pick<NodePgDatabase, "select">;

type Selection = {
  ids?: string[];
  keyword?: string | undefined;
  boundary?: string | undefined;
  parent?: string | undefined;
  root?: boolean | undefined;
  page?: number;
  pageSize?: number;
};
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const boundaryFilter = (path: string | undefined) =>
  path
    ? or(eq(regions.path, path), like(regions.path, `${path}.%`))
    : undefined;

@Injectable()
export class ScopeOptionsRepository {
  async organization(tx: CandidateDatabase, id: string, lock = false) {
    const q = tx
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.id, id),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
        ),
      );
    return (lock ? await q.for("share") : await q)[0];
  }
  async region(tx: CandidateDatabase, code: string, lock = false) {
    const q = tx
      .select()
      .from(regions)
      .where(and(eq(regions.code, code), eq(regions.status, 1)));
    return (lock ? await q.for("share") : await q)[0];
  }
  async regionOptions(tx: CandidateDatabase, input: Selection, lock = false) {
    if (input.ids && !input.ids.length) return { items: [], total: 0 };
    const where = and(
      eq(regions.status, 1),
      boundaryFilter(input.boundary),
      input.ids ? inArray(regions.code, input.ids) : undefined,
      input.keyword ? ilike(regions.name, pattern(input.keyword)) : undefined,
      input.parent ? eq(regions.parentCode, input.parent) : undefined,
      input.root
        ? input.boundary
          ? eq(regions.path, input.boundary)
          : isNull(regions.parentCode)
        : undefined,
    );
    const q = tx
      .select({
        value: regions.code,
        name: regions.name,
        parentValue: regions.parentCode,
        path: regions.path,
      })
      .from(regions)
      .where(where)
      .orderBy(regions.code);
    const items = lock
      ? await q.for("share")
      : input.pageSize
        ? await q
            .limit(input.pageSize)
            .offset(((input.page ?? 1) - 1) * input.pageSize)
        : await q;
    const total = input.pageSize
      ? ((await tx.select({ value: count() }).from(regions).where(where))[0]
          ?.value ?? 0)
      : items.length;
    return { items, total };
  }
  async schoolOptions(tx: CandidateDatabase, input: Selection, lock = false) {
    if (input.ids && !input.ids.length) return { items: [], total: 0 };
    const where = and(
      eq(organizations.type, "school"),
      eq(organizations.status, 1),
      isNull(organizations.deletedAt),
      eq(regions.status, 1),
      boundaryFilter(input.boundary),
      input.ids ? inArray(organizations.id, input.ids) : undefined,
      input.keyword
        ? ilike(organizations.name, pattern(input.keyword))
        : undefined,
    );
    const q = tx
      .select({
        value: organizations.id,
        name: organizations.name,
        parentValue: regions.code,
        path: regions.path,
      })
      .from(organizations)
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(where)
      .orderBy(organizations.name, organizations.id);
    const items = lock
      ? await q.for("share", { of: [organizations, regions] })
      : input.pageSize
        ? await q
            .limit(input.pageSize)
            .offset(((input.page ?? 1) - 1) * input.pageSize)
        : await q;
    const total = input.pageSize
      ? ((
          await tx
            .select({ value: count() })
            .from(organizations)
            .innerJoin(regions, eq(regions.code, organizations.regionCode))
            .where(where)
        )[0]?.value ?? 0)
      : items.length;
    return { items, total };
  }
}
