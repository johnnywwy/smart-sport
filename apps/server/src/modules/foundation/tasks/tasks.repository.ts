import { Inject, Injectable } from "@nestjs/common";
import type { TaskListQuery } from "@smart-sport/contracts";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { Repository } from "../../../database/repository.js";
import { tasks } from "../../../schema/public.js";
export type TaskTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type TaskRow = typeof tasks.$inferSelect;
@Injectable()
export class TasksRepository extends Repository<typeof tasks> {
  constructor(@Inject(DRIZZLE) private readonly database: NodePgDatabase) {
    super(database, tasks);
  }
  transaction<T>(callback: (tx: TaskTransaction) => Promise<T>) {
    return this.database.transaction(callback);
  }
  async lockPolicy(tx: TaskTransaction) {
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  async create(tx: TaskTransaction, input: typeof tasks.$inferInsert) {
    const [row] = await tx.insert(tasks).values(input).returning();
    if (!row) throw new Error("任务记录创建失败");
    return row;
  }
  async lock(
    tx: TaskTransaction,
    id: string,
    owner?: { identityId: string; orgId: string },
  ) {
    const [row] = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, id),
          isNull(tasks.deletedAt),
          owner ? this.owned(owner.identityId, owner.orgId) : undefined,
        ),
      )
      .for("update");
    return row;
  }
  private owned(identityId: string, orgId: string) {
    return and(
      eq(tasks.identityId, identityId),
      eq(tasks.orgId, orgId),
      isNull(tasks.deletedAt),
    );
  }
  async detail(id: string, identityId: string, orgId: string) {
    const [row] = await this.database
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), this.owned(identityId, orgId)));
    return row;
  }
  async list(identityId: string, orgId: string, query: TaskListQuery) {
    // 三个查询使用同一事务快照，避免进度变动使数量与列表互相矛盾。
    const owner = this.owned(identityId, orgId);
    const filter = and(
      owner,
      query.status === "active"
        ? inArray(tasks.status, ["queued", "running"])
        : query.status
          ? eq(tasks.status, query.status)
          : undefined,
    );
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`,
      );
      const items = await tx
        .select()
        .from(tasks)
        .where(filter)
        .orderBy(desc(tasks.createdAt), desc(tasks.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [total] = await tx
        .select({ value: count() })
        .from(tasks)
        .where(filter);
      const [active] = await tx
        .select({ value: count() })
        .from(tasks)
        .where(and(owner, inArray(tasks.status, ["queued", "running"])));
      return {
        items,
        total: total?.value ?? 0,
        activeCount: active?.value ?? 0,
      };
    });
  }
  save(
    tx: TaskTransaction,
    row: TaskRow,
    patch: Partial<typeof tasks.$inferInsert>,
    actorId = row.identityId,
  ) {
    return new Repository(tx, tasks).updateWithVersion(
      { id: row.id, version: row.version, actorId, scope: sql`true` },
      patch,
    );
  }
}
