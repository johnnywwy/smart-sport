import { Inject, Injectable } from "@nestjs/common";
import type {
  SubscriptionQuery,
  SubscriptionStatus,
  VisibleScope,
} from "@smart-sport/contracts";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import {
  type auditLogs,
  identities,
  organizations,
  regions,
  schoolApps,
  schoolSubscriptionLogs,
  schoolSubscriptions,
  users,
} from "../../../schema/public.js";

export type SubscriptionTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type SubscriptionRow = typeof schoolSubscriptions.$inferSelect;
@Injectable()
export class SubscriptionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(run: (tx: SubscriptionTransaction) => Promise<T>) {
    return this.db.transaction(run);
  }
  lockPolicy(tx: SubscriptionTransaction) {
    return tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR UPDATE`,
    );
  }
  async school(
    id: string,
    db: NodePgDatabase | SubscriptionTransaction = this.db,
  ) {
    return (
      await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .innerJoin(regions, eq(regions.code, organizations.regionCode))
        .where(
          and(
            eq(organizations.id, id),
            eq(organizations.type, "school"),
            eq(organizations.status, 1),
            isNull(organizations.deletedAt),
            eq(regions.status, 1),
          ),
        )
    )[0];
  }
  async snapshot(
    id: string,
    db: NodePgDatabase | SubscriptionTransaction = this.db,
    lock = false,
  ) {
    const query = db
      .select({ subscription: schoolSubscriptions, app: schoolApps })
      .from(schoolSubscriptions)
      .leftJoin(
        schoolApps,
        and(
          eq(schoolApps.schoolId, schoolSubscriptions.schoolId),
          isNull(schoolApps.deletedAt),
        ),
      )
      .where(
        and(
          eq(schoolSubscriptions.schoolId, id),
          isNull(schoolSubscriptions.deletedAt),
        ),
      )
      .orderBy(asc(schoolApps.appCode));
    const rows = await (lock
      ? query.for("update", { of: schoolSubscriptions })
      : query);
    const subscription = rows[0]?.subscription ?? null;
    const apps = rows.flatMap((row) => (row.app ? [row.app] : []));
    return { subscription, apps };
  }
  async salesIdentity(
    id: string,
    db: NodePgDatabase | SubscriptionTransaction = this.db,
  ) {
    return (
      await db
        .select({ id: identities.id, name: users.realName })
        .from(identities)
        .innerJoin(users, eq(users.id, identities.userId))
        .innerJoin(organizations, eq(organizations.id, identities.orgId))
        .where(
          and(
            eq(identities.id, id),
            eq(identities.type, "company"),
            eq(identities.status, 1),
            isNull(identities.deletedAt),
            eq(users.status, 1),
            isNull(users.deletedAt),
            eq(organizations.type, "company"),
            eq(organizations.status, 1),
            isNull(organizations.deletedAt),
          ),
        )
    )[0];
  }
  history(id: string) {
    return this.db
      .select()
      .from(schoolSubscriptionLogs)
      .where(eq(schoolSubscriptionLogs.schoolId, id))
      .orderBy(
        desc(schoolSubscriptionLogs.createdAt),
        desc(schoolSubscriptionLogs.id),
      );
  }
  async list(scope: VisibleScope, query: SubscriptionQuery, today: string) {
    const t = schoolSubscriptions;
    const effective = sql<SubscriptionStatus>`CASE WHEN ((${today}::date)<(${t.serviceStart} AT TIME ZONE 'Asia/Shanghai')::date) THEN 'suspended' WHEN ((${today}::date)<=(${t.serviceEnd} AT TIME ZONE 'Asia/Shanghai')::date) THEN CASE WHEN ${t.contractNo} IS NULL THEN 'trial' ELSE 'active' END WHEN ((${today}::date)<=(${t.serviceEnd} AT TIME ZONE 'Asia/Shanghai')::date+${t.graceDays}) THEN 'grace' ELSE 'suspended' END`;
    const keyword = query.keyword?.replace(/[\\%_]/g, "\\$&");
    const where = and(
      isNull(t.deletedAt),
      isNull(organizations.deletedAt),
      eq(organizations.type, "school"),
      eq(organizations.status, 1),
      eq(regions.status, 1),
      scope.kind === "all-schools"
        ? undefined
        : scope.kind === "schools" && scope.schoolIds.length
          ? inArray(t.schoolId, scope.schoolIds)
          : sql`false`,
      query.status ? eq(effective, query.status) : undefined,
      query.expiringInDays !== undefined
        ? sql`(${t.serviceEnd} AT TIME ZONE 'Asia/Shanghai')::date BETWEEN ${today}::date AND ${today}::date+${query.expiringInDays}::int`
        : undefined,
      keyword ? sql`${organizations.name} ILIKE ${`%${keyword}%`}` : undefined,
    );
    const rows = await this.db
      .select({ subscription: t, schoolName: organizations.name })
      .from(t)
      .innerJoin(organizations, eq(organizations.id, t.schoolId))
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(where)
      .orderBy(asc(t.serviceEnd), asc(t.schoolId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(t)
      .innerJoin(organizations, eq(organizations.id, t.schoolId))
      .innerJoin(regions, eq(regions.code, organizations.regionCode))
      .where(where);
    return { rows, total: count?.total ?? 0 };
  }
  async batch(after: string | undefined, limit: number) {
    return this.db
      .select({ schoolId: schoolSubscriptions.schoolId })
      .from(schoolSubscriptions)
      .innerJoin(
        organizations,
        eq(organizations.id, schoolSubscriptions.schoolId),
      )
      .where(
        and(
          isNull(schoolSubscriptions.deletedAt),
          isNull(organizations.deletedAt),
          eq(organizations.type, "school"),
          eq(organizations.status, 1),
          after
            ? sql`${schoolSubscriptions.schoolId}>${after}::uuid`
            : undefined,
        ),
      )
      .orderBy(asc(schoolSubscriptions.schoolId))
      .limit(limit);
  }
  async insert(
    tx: SubscriptionTransaction,
    input: typeof schoolSubscriptions.$inferInsert,
  ) {
    const row = (
      await tx.insert(schoolSubscriptions).values(input).returning()
    )[0];
    if (!row) throw new Error("服务写入失败");
    return row;
  }
  insertApps(
    tx: SubscriptionTransaction,
    input: (typeof schoolApps.$inferInsert)[],
  ) {
    return tx.insert(schoolApps).values(input);
  }
  async status(
    tx: SubscriptionTransaction,
    row: SubscriptionRow,
    status: SubscriptionStatus,
  ) {
    return (
      await tx
        .update(schoolSubscriptions)
        .set({
          status,
          updatedAt: new Date(),
          updatedBy: null,
          version: sql`${schoolSubscriptions.version}+1`,
        })
        .where(
          and(
            eq(schoolSubscriptions.id, row.id),
            eq(schoolSubscriptions.version, row.version),
            isNull(schoolSubscriptions.deletedAt),
          ),
        )
        .returning()
    )[0];
  }
  log(
    tx: SubscriptionTransaction,
    input: typeof schoolSubscriptionLogs.$inferInsert,
  ) {
    return tx.insert(schoolSubscriptionLogs).values(input);
  }
  audit(tx: SubscriptionTransaction, input: typeof auditLogs.$inferInsert) {
    return auditWriter.write(tx, input);
  }
}
