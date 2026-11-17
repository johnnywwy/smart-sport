import { Inject, Injectable } from "@nestjs/common";
import {
  type SystemParamKey,
  type SystemParamQuery,
  systemParamDefinitions,
} from "@smart-sport/contracts";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { Repository } from "../../../database/repository.js";
import { auditLogs, systemParams } from "../../../schema/public.js";
export type ParamTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type ParamRow = typeof systemParams.$inferSelect;
@Injectable()
export class ParamsRepository extends Repository<typeof systemParams> {
  constructor(@Inject(DRIZZLE) private readonly database: NodePgDatabase) {
    super(database, systemParams);
  }
  transaction<T>(action: (tx: ParamTransaction) => Promise<T>) {
    return this.database.transaction(action);
  }
  initialize() {
    return this.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167,116)`);
      for (const d of systemParamDefinitions) {
        await tx
          .insert(systemParams)
          .values({
            key: d.key,
            name: d.name,
            value: d.defaultValue,
            valueSchema: { type: "integer", minimum: d.min, maximum: d.max },
            remark: d.remark,
          })
          .onConflictDoUpdate({
            target: systemParams.key,
            targetWhere: sql`${systemParams.deletedAt} IS NULL`,
            set: {
              updatedAt: sql`now()`,
              version: sql`${systemParams.version}+1`,
              name: d.name,
              remark: d.remark,
              valueSchema: { type: "integer", minimum: d.min, maximum: d.max },
            },
            setWhere: sql`${systemParams.name} IS DISTINCT FROM ${d.name} OR ${systemParams.remark} IS DISTINCT FROM ${d.remark} OR ${systemParams.valueSchema} IS DISTINCT FROM ${JSON.stringify({ type: "integer", minimum: d.min, maximum: d.max })}::jsonb`,
          });
      }
    });
  }
  async value(key: SystemParamKey, tx?: ParamTransaction) {
    const [row] = await (tx ?? this.database)
      .select()
      .from(systemParams)
      .where(and(eq(systemParams.key, key), isNull(systemParams.deletedAt)));
    return row;
  }
  async byId(id: string, tx?: ParamTransaction, lock = false) {
    const query = (tx ?? this.database)
      .select()
      .from(systemParams)
      .where(and(eq(systemParams.id, id), isNull(systemParams.deletedAt)));
    const [row] = await (lock ? query.for("update") : query);
    return row;
  }
  async list(input: SystemParamQuery) {
    const keyword = input.keyword
      ? `%${input.keyword.replace(/[\\%_]/g, "\\$&")}%`
      : undefined;
    const condition = and(
      isNull(systemParams.deletedAt),
      keyword
        ? or(
            ilike(systemParams.name, keyword),
            ilike(systemParams.remark, keyword),
          )
        : undefined,
    );
    const order = input.sort.endsWith(":desc") ? desc : asc;
    const field = input.sort.startsWith("updatedAt:")
      ? systemParams.updatedAt
      : systemParams.name;
    const [items, total] = await Promise.all([
      this.database
        .select()
        .from(systemParams)
        .where(condition)
        .orderBy(order(field), asc(systemParams.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database
        .select({ count: count() })
        .from(systemParams)
        .where(condition),
    ]);
    return {
      items,
      total: total[0]?.count ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async lockPolicy(tx: ParamTransaction) {
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  update(tx: ParamTransaction, row: ParamRow, value: number, actorId: string) {
    return new Repository(tx, systemParams).updateWithVersion(
      { id: row.id, version: row.version, actorId, scope: sql`true` },
      { value },
    );
  }
  audit(tx: ParamTransaction, input: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(input);
  }
}
