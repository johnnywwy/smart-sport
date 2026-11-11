import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  identities,
  loginLogs,
  userSessions,
  users,
} from "../../../schema/public.js";

export type AuthTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
export type LoginMetadata = { ip: string; userAgent: string; traceId: string };

@Injectable()
export class AuthRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  transaction<T>(callback: (tx: AuthTransaction) => Promise<T>) {
    return this.db.transaction(callback);
  }

  findAccount(tx: AuthTransaction, account: string, phoneHash: string) {
    // 多种标识匹配多个账号时拒绝登录，不猜测账号优先级。
    return tx
      .select()
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(
            eq(users.username, account),
            eq(users.email, account),
            eq(users.phoneHash, phoneHash),
          ),
        ),
      )
      .for("update");
  }

  async identityCount(tx: AuthTransaction, userId: string) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(identities)
      .where(
        and(
          eq(identities.userId, userId),
          eq(identities.status, 1),
          isNull(identities.deletedAt),
          notInArray(identities.type, ["student", "parent"]),
        ),
      );
    return row?.count ?? 0;
  }

  async resetFailures(tx: AuthTransaction, userId: string) {
    await tx
      .update(users)
      .set({
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
        version: sql`${users.version} + 1`,
      })
      .where(eq(users.id, userId));
  }

  createSession(
    tx: AuthTransaction,
    session: typeof userSessions.$inferInsert,
  ) {
    return tx.insert(userSessions).values(session);
  }

  async recordLogin(
    tx: AuthTransaction,
    data: {
      userId: string | null;
      account: string;
      result: "success" | "bad_password" | "locked" | "disabled";
      metadata: LoginMetadata;
      date: Date;
    },
  ) {
    await tx.insert(loginLogs).values({
      userId: data.userId,
      usernameInput: data.account,
      result: data.result,
      ip: data.metadata.ip,
      userAgent: data.metadata.userAgent,
      createdAt: data.date,
    });
    await tx.insert(auditLogs).values({
      userId: data.userId,
      action: "auth.login",
      targetType: "user",
      targetId: data.userId,
      changes: { result: data.result },
      ip: data.metadata.ip,
      userAgent: data.metadata.userAgent,
      traceId: data.metadata.traceId,
      createdAt: data.date,
    });
  }
}
