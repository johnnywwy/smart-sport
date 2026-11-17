import { Inject, Injectable } from "@nestjs/common";
import {
  type NumberType,
  numberDefinitions,
  type UpdateNumberRule,
} from "@smart-sport/contracts";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { Repository } from "../../../database/repository.js";
import {
  auditLogs,
  numberIssues,
  numberRules,
} from "../../../schema/public.js";

export type NumberTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type NumberRuleRow = typeof numberRules.$inferSelect;
const shanghaiYear =
  sql<number>`EXTRACT(YEAR FROM clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::int`.mapWith(
    Number,
  );
@Injectable()
export class NumbersRepository extends Repository<typeof numberRules> {
  constructor(@Inject(DRIZZLE) private readonly database: NodePgDatabase) {
    super(database, numberRules);
  }
  transaction<T>(callback: (tx: NumberTransaction) => Promise<T>) {
    return this.database.transaction(callback);
  }
  async initialize() {
    await this.database
      .insert(numberRules)
      .values(
        numberDefinitions.map(({ type, prefix }) => ({
          type,
          prefix,
          digits: 6,
          reset: "yearly" as const,
          year: shanghaiYear,
        })),
      )
      .onConflictDoNothing({
        target: numberRules.type,
        where: sql`${numberRules.deletedAt} IS NULL`,
      });
  }
  async lockPolicy(tx: NumberTransaction) {
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  async lockByType(tx: NumberTransaction, type: NumberType) {
    const [row] = await tx
      .select()
      .from(numberRules)
      .where(and(eq(numberRules.type, type), isNull(numberRules.deletedAt)))
      .for("update");
    return row;
  }
  async lockById(tx: NumberTransaction, id: string) {
    const [row] = await tx
      .select()
      .from(numberRules)
      .where(and(eq(numberRules.id, id), isNull(numberRules.deletedAt)))
      .for("update");
    return row;
  }
  async year(tx: Pick<NumberTransaction, "select">) {
    const [row] = await tx
      .select({ year: shanghaiYear })
      .from(numberRules)
      .limit(1);
    if (!row) throw new Error("缺少编号规则");
    return row.year;
  }
  private lastIssued(
    prefix: string | typeof numberRules.prefix,
    year: number | typeof shanghaiYear,
  ) {
    return sql<number>`coalesce((SELECT max(i.value) FROM public.number_issues i WHERE i.prefix=${prefix} AND i.year=${year}),0)`.mapWith(
      Number,
    );
  }
  list() {
    return this.database
      .select({
        rule: numberRules,
        year: shanghaiYear,
        lastIssued: this.lastIssued(numberRules.prefix, shanghaiYear),
      })
      .from(numberRules)
      .where(isNull(numberRules.deletedAt))
      .orderBy(asc(numberRules.type));
  }
  async issued(tx: NumberTransaction, prefix: string, year: number) {
    const [row] = await tx
      .select({ value: this.lastIssued(prefix, year) })
      .from(numberRules)
      .limit(1);
    return row?.value ?? 0;
  }
  /** 规则已被当前业务事务锁定，原子推进计数并返回已保存状态。 */
  async advance(
    tx: NumberTransaction,
    row: NumberRuleRow,
    year: number,
    value: number,
  ) {
    const [saved] = await tx
      .update(numberRules)
      .set({
        year,
        currentValue: value,
        version: sql`${numberRules.version}+1`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(numberRules.id, row.id),
          eq(numberRules.version, row.version),
          isNull(numberRules.deletedAt),
        ),
      )
      .returning();
    if (!saved) throw new Error("编号规则锁内更新失败");
    return saved;
  }
  register(tx: NumberTransaction, input: typeof numberIssues.$inferInsert) {
    return tx.insert(numberIssues).values(input);
  }
  configure(
    tx: NumberTransaction,
    row: NumberRuleRow,
    input: UpdateNumberRule,
    identityId: string,
  ) {
    return new Repository(tx, numberRules).updateWithVersion(
      {
        id: row.id,
        version: input.version,
        actorId: identityId,
        scope: sql`true`,
      },
      { prefix: input.prefix, digits: input.digits, reset: input.reset },
    );
  }
  audit(tx: NumberTransaction, input: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(input);
  }
}
