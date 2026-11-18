import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import { identities, organizations, regions } from "../../../schema/public.js";

export type OrganizationsTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  transaction<T>(callback: (tx: OrganizationsTransaction) => Promise<T>) {
    return this.db.transaction(callback);
  }

  async findCompanyActor(identityId: string) {
    const [row] = await this.db
      .select({
        identityId: identities.id,
        userId: identities.userId,
        orgId: identities.orgId,
      })
      .from(identities)
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .where(
        and(
          eq(identities.id, identityId),
          eq(identities.type, "company"),
          eq(identities.status, 1),
          isNull(identities.deletedAt),
          eq(organizations.type, "company"),
          eq(organizations.status, 1),
          isNull(organizations.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async findEnabledRegion(
    code: string,
    source: Pick<NodePgDatabase, "select"> | OrganizationsTransaction = this.db,
  ) {
    const [row] = await source
      .select({ code: regions.code, name: regions.name })
      .from(regions)
      .where(and(eq(regions.code, code), eq(regions.status, 1)))
      .limit(1);
    return row;
  }

  async list(input: {
    type?: "company" | "bureau" | "agent" | "school" | undefined;
    keyword?: string | undefined;
    regionCode?: string | undefined;
    page: number;
    pageSize: number;
  }) {
    const filter = and(
      isNull(organizations.deletedAt),
      input.type ? eq(organizations.type, input.type) : undefined,
      input.regionCode
        ? eq(organizations.regionCode, input.regionCode)
        : undefined,
      input.keyword
        ? or(
            ilike(organizations.name, `%${input.keyword}%`),
            ilike(regions.name, `%${input.keyword}%`),
          )
        : undefined,
    );
    const [items, totals] = await Promise.all([
      this.db
        .select({
          id: organizations.id,
          type: organizations.type,
          name: organizations.name,
          regionCode: organizations.regionCode,
          regionName: regions.name,
          status: organizations.status,
          version: organizations.version,
        })
        .from(organizations)
        .leftJoin(regions, eq(regions.code, organizations.regionCode))
        .where(filter)
        .orderBy(asc(organizations.type), asc(organizations.name))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db
        .select({ count: count() })
        .from(organizations)
        .leftJoin(regions, eq(regions.code, organizations.regionCode))
        .where(filter),
    ]);
    return { items, total: totals[0]?.count ?? 0 };
  }

  async findById(tx: OrganizationsTransaction, id: string, lock = false) {
    const query = tx
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
      .limit(1);
    const rows = lock ? await query.for("update") : await query;
    return rows[0];
  }

  create(
    tx: OrganizationsTransaction,
    input: typeof organizations.$inferInsert,
  ) {
    return tx.insert(organizations).values(input).returning();
  }

  async update(
    tx: OrganizationsTransaction,
    input: {
      id: string;
      version: number;
      actorId: string;
      changes: Partial<
        Pick<
          typeof organizations.$inferInsert,
          "name" | "regionCode" | "status"
        >
      >;
    },
  ) {
    const [row] = await tx
      .update(organizations)
      .set({
        ...input.changes,
        updatedAt: new Date(),
        updatedBy: input.actorId,
        version: sql`${organizations.version} + 1`,
      })
      .where(
        and(
          eq(organizations.id, input.id),
          eq(organizations.version, input.version),
          isNull(organizations.deletedAt),
        ),
      )
      .returning();
    return row;
  }

  audit(
    tx: OrganizationsTransaction,
    input: {
      actor: { userId: string; identityId: string; orgId: string };
      action: string;
      targetId: string;
      changes: Record<string, unknown>;
      traceId: string;
      ip: string;
      userAgent: string;
    },
  ) {
    return auditWriter.write(tx, {
      userId: input.actor.userId,
      identityId: input.actor.identityId,
      orgId: input.actor.orgId,
      action: input.action,
      targetType: "organization",
      targetId: input.targetId,
      changes: input.changes,
      traceId: input.traceId,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
  }
}
