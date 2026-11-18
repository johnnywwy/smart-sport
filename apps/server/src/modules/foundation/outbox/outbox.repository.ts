import { Inject, Injectable } from "@nestjs/common";
import type { OutboxEventInput, OutboxReference } from "@smart-sport/contracts";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DataSourceRegistry } from "../../../database/registry.js";
import { Repository } from "../../../database/repository.js";
import { outboxConsumptions, outboxEvents } from "../../../schema/outbox.js";
export type OutboxTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type OutboxEvent = typeof outboxEvents.$inferSelect;

@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DataSourceRegistry) private readonly sources: DataSourceRegistry,
  ) {}
  append(
    tx: OutboxTransaction,
    input: OutboxEventInput,
    actorId: string | null,
  ) {
    return tx
      .insert(outboxEvents)
      .values({ ...input, createdBy: actorId, updatedBy: actorId })
      .returning();
  }
  async event(reference: OutboxReference) {
    return new Repository(
      this.sources.get(reference.datasource).db,
      outboxEvents,
    ).findById(reference.eventId, sql`true`);
  }
  async dispatchOne(
    source: string,
    publish: (event: OutboxEvent) => Promise<void>,
  ) {
    return this.sources.get(source).db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, "pending"),
            isNull(outboxEvents.deletedAt),
            lte(outboxEvents.nextRetryAt, sql`clock_timestamp()`),
          ),
        )
        .orderBy(asc(outboxEvents.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return undefined;
      let delivered = false;
      try {
        await publish(row);
        delivered = true;
      } catch {
        /* 不保存驱动异常或业务载荷。 */
      }
      const attempts = delivered ? row.attempts : row.attempts + 1;
      const status = delivered
        ? "published"
        : attempts > 10
          ? "failed"
          : "pending";
      const delayMs = Math.min(
        3_600_000,
        1000 * 2 ** Math.max(0, attempts - 1),
      );
      const [updated] = await tx
        .update(outboxEvents)
        .set({
          status,
          attempts,
          publishedAt: delivered ? sql`clock_timestamp()` : null,
          nextRetryAt:
            status === "pending"
              ? sql`clock_timestamp() + ${delayMs} * interval '1 millisecond'`
              : null,
          lastError: delivered ? null : "delivery_failed",
          updatedAt: sql`clock_timestamp()`,
          version: sql`${outboxEvents.version}+1`,
        })
        .where(
          and(
            eq(outboxEvents.id, row.id),
            eq(outboxEvents.version, row.version),
            isNull(outboxEvents.deletedAt),
          ),
        )
        .returning();
      if (!updated) throw new Error("投递记录版本冲突");
      return updated;
    });
  }
  async consume<T>(
    target: string,
    consumer: string,
    reference: OutboxReference,
    callback: (tx: OutboxTransaction) => Promise<T>,
  ) {
    return this.sources.get(target).db.transaction(async (tx) => {
      const inserted = await tx
        .insert(outboxConsumptions)
        .values({
          sourceDatasource: reference.datasource,
          eventId: reference.eventId,
          consumer,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted.length) return { duplicate: true as const };
      const result = await callback(tx);
      return { duplicate: false as const, result };
    });
  }
  failures(source: string, limit: number) {
    return this.sources
      .get(source)
      .db.select({
        id: outboxEvents.id,
        topic: outboxEvents.topic,
        schoolId: outboxEvents.schoolId,
        attempts: outboxEvents.attempts,
        updatedAt: outboxEvents.updatedAt,
      })
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.status, "failed"), isNull(outboxEvents.deletedAt)),
      )
      .orderBy(asc(outboxEvents.id))
      .limit(limit);
  }
}
