import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateDictItem,
  type DictItemQuery,
  type DictTypeCode,
  dictDefinitions,
  type UpdateDictItem,
} from "@smart-sport/contracts";
import { and, asc, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { Repository } from "../../../database/repository.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import {
  type auditLogs,
  dictItems,
  dictTypes,
} from "../../../schema/public.js";
export type DictTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type DictItemRow = typeof dictItems.$inferSelect;
@Injectable()
export class DictsRepository extends Repository<typeof dictItems> {
  constructor(@Inject(DRIZZLE) private readonly database: NodePgDatabase) {
    super(database, dictItems);
  }
  transaction<T>(callback: (tx: DictTransaction) => Promise<T>) {
    return this.database.transaction(callback);
  }
  async initialize() {
    await this.transaction(async (tx) => {
      // 多实例同步串行进行；只覆盖代码拥有的内置数据，不触碰自定义数据或使用标记。
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167,115)`);
      for (const definition of dictDefinitions) {
        await tx
          .insert(dictTypes)
          .values({ code: definition.code, name: definition.name })
          .onConflictDoUpdate({
            target: dictTypes.code,
            set: {
              name: definition.name,
              updatedAt: sql`now()`,
              version: sql`${dictTypes.version}+1`,
            },
            setWhere: sql`${dictTypes.name} IS DISTINCT FROM ${definition.name}`,
          });
        for (const [sort, item] of definition.items.entries()) {
          const description = item.description ?? "";
          await tx
            .insert(dictItems)
            .values({
              typeCode: definition.code,
              ...item,
              sort: sort + 1,
              isSystem: true,
            })
            .onConflictDoUpdate({
              target: [dictItems.typeCode, dictItems.value],
              set: {
                label: item.label,
                description,
                sort: sort + 1,
                updatedAt: sql`now()`,
                version: sql`${dictItems.version}+1`,
              },
              setWhere: sql`${dictItems.isSystem} AND (${dictItems.label} IS DISTINCT FROM ${item.label} OR ${dictItems.description} IS DISTINCT FROM ${description} OR ${dictItems.sort} IS DISTINCT FROM ${sort + 1})`,
            });
        }
      }
    });
  }
  async lockPolicy(tx: DictTransaction) {
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  async lockById(tx: DictTransaction, id: string) {
    const [row] = await tx
      .select()
      .from(dictItems)
      .where(and(eq(dictItems.id, id), isNull(dictItems.deletedAt)))
      .for("update");
    return row;
  }
  async byValue(
    tx: DictTransaction,
    typeCode: DictTypeCode,
    value: string,
    lock = false,
  ) {
    const query = tx
      .select()
      .from(dictItems)
      .where(
        and(
          eq(dictItems.typeCode, typeCode),
          eq(dictItems.value, value),
          isNull(dictItems.deletedAt),
        ),
      );
    const [row] = await (lock ? query.for("update") : query);
    return row;
  }
  options(typeCode: DictTypeCode) {
    return this.database
      .select({ value: dictItems.value, label: dictItems.label })
      .from(dictItems)
      .where(
        and(
          eq(dictItems.typeCode, typeCode),
          eq(dictItems.enabled, true),
          isNull(dictItems.deletedAt),
        ),
      )
      .orderBy(asc(dictItems.sort), asc(dictItems.id));
  }
  async list(typeCode: DictTypeCode, input: DictItemQuery) {
    const condition = and(
      eq(dictItems.typeCode, typeCode),
      isNull(dictItems.deletedAt),
      input.enabled === undefined
        ? undefined
        : eq(dictItems.enabled, input.enabled),
      input.keyword
        ? ilike(
            dictItems.label,
            `%${input.keyword.replace(/[\\%_]/g, "\\$&")}%`,
          )
        : undefined,
    );
    const order = input.sort.endsWith(":desc") ? desc : asc;
    const field = input.sort.startsWith("label:")
      ? dictItems.label
      : dictItems.sort;
    const [items, total] = await Promise.all([
      this.database
        .select()
        .from(dictItems)
        .where(condition)
        .orderBy(order(field), asc(dictItems.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.select({ count: count() }).from(dictItems).where(condition),
    ]);
    return {
      items,
      total: total[0]?.count ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async create(
    tx: DictTransaction,
    typeCode: DictTypeCode,
    input: CreateDictItem,
    value: string,
    actorId: string,
  ) {
    const [row] = await tx
      .insert(dictItems)
      .values({
        ...input,
        typeCode,
        value,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();
    if (!row) throw new Error("字典新增没有返回记录");
    return row;
  }
  update(
    tx: DictTransaction,
    row: DictItemRow,
    input: UpdateDictItem,
    actorId: string,
  ) {
    return new Repository(tx, dictItems).updateWithVersion(
      { id: row.id, version: input.version, actorId, scope: sql`true` },
      {
        label: input.label,
        description: input.description,
        sort: input.sort,
        enabled: input.enabled,
      },
    );
  }
  remove(tx: DictTransaction, row: DictItemRow, actorId: string) {
    return new Repository(tx, dictItems).softDeleteWithVersion({
      id: row.id,
      version: row.version,
      actorId,
      scope: sql`true`,
    });
  }
  markUsed(tx: DictTransaction, row: DictItemRow) {
    return tx
      .update(dictItems)
      .set({
        usedAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
        version: sql`${dictItems.version}+1`,
      })
      .where(and(eq(dictItems.id, row.id), isNull(dictItems.usedAt)));
  }
  audit(tx: DictTransaction, input: typeof auditLogs.$inferInsert) {
    return auditWriter.write(tx, input);
  }
}
