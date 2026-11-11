import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  identities,
  loginLogs,
  passwordHistory,
  refreshTokens,
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
  async findRefresh(tx: AuthTransaction, tokenHash: string) {
    // 先只查历史定位账号，再按账号→会话→历史的固定顺序加锁，避免与登录互锁。
    const [token] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    if (!token) return undefined;
    const [reference] = await tx
      .select({ userId: userSessions.userId })
      .from(userSessions)
      .where(eq(userSessions.id, token.sessionId));
    if (!reference) return undefined;
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, reference.userId))
      .for("update");
    const [session] = await tx
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, token.sessionId))
      .for("update");
    const [currentToken] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for("update");
    return user && session && currentToken
      ? { user, session, token: currentToken }
      : undefined;
  }

  addRefresh(tx: AuthTransaction, value: typeof refreshTokens.$inferInsert) {
    return tx.insert(refreshTokens).values(value);
  }

  async rotateRefresh(
    tx: AuthTransaction,
    sessionId: string,
    oldHash: string,
    newHash: string,
    date: Date,
  ) {
    await tx
      .update(refreshTokens)
      .set({ consumedAt: date })
      .where(eq(refreshTokens.tokenHash, oldHash));
    await tx
      .update(userSessions)
      .set({
        refreshTokenHash: newHash,
        lastActiveAt: date,
        updatedAt: date,
        version: sql`${userSessions.version} + 1`,
      })
      .where(eq(userSessions.id, sessionId));
  }

  async revokeSession(tx: AuthTransaction, sessionId: string, date: Date) {
    await tx
      .update(userSessions)
      .set({
        revokedAt: date,
        updatedAt: date,
        version: sql`${userSessions.version} + 1`,
      })
      .where(
        and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)),
      );
  }

  async findIdentity(tx: AuthTransaction, identityId: string, userId: string) {
    const [identity] = await tx
      .select()
      .from(identities)
      .where(
        and(
          eq(identities.id, identityId),
          eq(identities.userId, userId),
          eq(identities.status, 1),
          isNull(identities.deletedAt),
          notInArray(identities.type, ["student", "parent"]),
        ),
      );
    return identity;
  }

  recordLogout(
    tx: AuthTransaction,
    userId: string,
    sessionId: string,
    metadata: LoginMetadata,
    date: Date,
  ) {
    return tx.insert(auditLogs).values({
      userId,
      action: "auth.logout",
      targetType: "session",
      targetId: sessionId,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      traceId: metadata.traceId,
      createdAt: date,
    });
  }

  async findSessionForPasswordChange(tx: AuthTransaction, sessionId: string) {
    const [session] = await tx
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, sessionId))
      .for("update");
    if (!session) return undefined;
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .for("update");
    return user ? { session, user } : undefined;
  }

  recentPasswordHashes(tx: AuthTransaction, userId: string, limit: number) {
    return tx
      .select({ passwordHash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(sql`${passwordHistory.createdAt} DESC`)
      .limit(limit);
  }

  async changePassword(
    tx: AuthTransaction,
    data: {
      userId: string;
      sessionId: string;
      previousHash: string;
      passwordHash: string;
      tokenVersion: number;
      date: Date;
      metadata: LoginMetadata;
    },
  ) {
    await tx.insert(passwordHistory).values({
      userId: data.userId,
      passwordHash: data.previousHash,
      createdAt: data.date,
    });
    await tx
      .update(users)
      .set({
        passwordHash: data.passwordHash,
        mustChangePassword: false,
        passwordChangedAt: data.date,
        tokenVersion: data.tokenVersion,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: data.date,
        version: sql`${users.version} + 1`,
      })
      .where(eq(users.id, data.userId));
    await tx
      .update(userSessions)
      .set({
        revokedAt: data.date,
        updatedAt: data.date,
        version: sql`${userSessions.version} + 1`,
      })
      .where(
        and(
          eq(userSessions.userId, data.userId),
          sql`${userSessions.id} <> ${data.sessionId}`,
          isNull(userSessions.revokedAt),
        ),
      );
    await tx
      .update(userSessions)
      .set({ updatedAt: data.date, version: sql`${userSessions.version} + 1` })
      .where(eq(userSessions.id, data.sessionId));
    await tx
      .update(refreshTokens)
      .set({ tokenVersion: data.tokenVersion })
      .where(
        and(
          eq(refreshTokens.sessionId, data.sessionId),
          isNull(refreshTokens.consumedAt),
        ),
      );
    await tx.insert(auditLogs).values({
      userId: data.userId,
      action: "auth.password.change",
      targetType: "user",
      targetId: data.userId,
      changes: { password: "已修改" },
      ip: data.metadata.ip,
      userAgent: data.metadata.userAgent,
      traceId: data.metadata.traceId,
      createdAt: data.date,
    });
  }
}
