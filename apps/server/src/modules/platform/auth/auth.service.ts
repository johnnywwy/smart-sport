import { createHash, createHmac, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  type ChangePasswordRequest,
  type LoginRequest,
  type LoginResponse,
  loginResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import { AccessTokenSigner } from "../../../infra/auth/access-token-signer.js";
import { PasswordHasher } from "../../../infra/crypto/password-hasher.js";
import { SERVER_CONFIG } from "../../../server-config.js";
import { IdentitiesService } from "../identities/index.js";
import { AuthRepository, type LoginMetadata } from "./auth.repository.js";
import { validateNewPassword } from "./password-policy.js";

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(AccessTokenSigner) private readonly signer: AccessTokenSigner,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(IdentitiesService) private readonly identities: IdentitiesService,
  ) {
    this.dummyHash = this.hasher.hash(randomBytes(32).toString("hex"));
  }

  /** 校验凭据，在事务内记录登录并创建账号级会话。 */
  async login(input: LoginRequest, metadata: LoginMetadata) {
    const phoneHash = createHmac(
      "sha256",
      Buffer.from(this.config.STUDENT_HMAC_KEY, "base64"),
    )
      .update(`phone:${input.account}`)
      .digest("hex");
    const result = await this.repository.transaction(async (tx) => {
      const date = new Date();
      const matches = await this.repository.findAccount(
        tx,
        input.account,
        phoneHash,
      );
      const user = matches.length === 1 ? matches[0] : undefined;
      const valid = await this.hasher.verify(
        user?.passwordHash ?? (await this.dummyHash),
        input.password,
      );
      const failure =
        user?.lockedUntil && user.lockedUntil > date
          ? "locked"
          : !user || !valid
            ? "bad_password"
            : user.status === 0
              ? "disabled"
              : null;
      const safeAccount = /^\+?\d{7,15}$/.test(input.account)
        ? "[手机号已脱敏]"
        : input.account;
      await this.repository.recordLogin(tx, {
        userId: user?.id ?? null,
        account: safeAccount,
        result: failure ?? "success",
        metadata,
        date,
      });
      if (failure || !user)
        return {
          error:
            failure === "disabled"
              ? 10004
              : failure === "locked"
                ? 10003
                : 10001,
        } as const;
      const sessionId = v7();
      const refreshToken = randomBytes(32).toString("base64url");
      const accessToken = await this.signer.signAccount({
        userId: user.id,
        sessionId,
        tokenVersion: user.tokenVersion,
      });
      const identityCount = await this.repository.identityCount(tx, user.id);
      await this.repository.resetFailures(tx, user.id);
      await this.repository.createSession(tx, {
        id: sessionId,
        userId: user.id,
        client: "admin",
        refreshTokenHash: createHash("sha256")
          .update(refreshToken)
          .digest("hex"),
        expiresAt: new Date(date.getTime() + 7 * 86400000),
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        lastActiveAt: date,
      });
      await this.repository.addRefresh(tx, {
        tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        sessionId,
        tokenVersion: user.tokenVersion,
      });
      return {
        body: {
          accessToken,
          mustChangePassword: user.mustChangePassword,
          identityCount,
          selectedIdentity: null,
        } as LoginResponse,
        refreshToken,
        session: {
          userId: user.id,
          sessionId,
          tokenVersion: user.tokenVersion,
        },
      };
    });
    // 失败记录先提交，再抛出 HTTP 错误，避免事务回滚丢失日志。
    if ("error" in result) throw new ApiException(result.error);
    if (!result.body.mustChangePassword) {
      try {
        const selection = await this.identities.autoSelectAfterLogin(
          result.session,
          metadata,
        );
        result.body.identityCount = selection.identityCount;
        result.body.selectedIdentity = selection.selectedIdentity;
        if (selection.accessToken)
          result.body.accessToken = selection.accessToken;
      } catch (error) {
        await this.identities.revokeSession(result.session.sessionId);
        throw error;
      }
    }
    return {
      body: loginResponseSchema.parse(result.body),
      refreshToken: result.refreshToken,
    };
  }
  /** 原值消费后仍保留哈希；重放吊销结果必须提交后再返回 401。 */
  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new ApiException(10005);
    const oldHash = createHash("sha256").update(refreshToken).digest("hex");
    const result = await this.repository.transaction(async (tx) => {
      const found = await this.repository.findRefresh(tx, oldHash);
      if (!found) return null;
      const { user, session, token } = found;
      const date = new Date();
      if (session.revokedAt || session.deletedAt) return null;
      if (
        token.consumedAt ||
        session.refreshTokenHash !== oldHash ||
        session.expiresAt <= date ||
        user.deletedAt ||
        user.status !== 1 ||
        user.tokenVersion !== token.tokenVersion ||
        session.client !== "admin"
      ) {
        await this.repository.revokeSession(tx, session.id, date);
        return null;
      }
      const input = {
        userId: user.id,
        sessionId: session.id,
        tokenVersion: user.tokenVersion,
      };
      if (
        session.identityId &&
        !(await this.repository.findIdentity(tx, session.identityId, user.id))
      ) {
        await this.repository.revokeSession(tx, session.id, date);
        return null;
      }
      const accessToken = session.identityId
        ? await this.signer.signIdentity({
            ...input,
            identityId: session.identityId,
          })
        : await this.signer.signAccount(input);
      const nextToken = randomBytes(32).toString("base64url");
      const nextHash = createHash("sha256").update(nextToken).digest("hex");
      await this.repository.rotateRefresh(
        tx,
        session.id,
        oldHash,
        nextHash,
        date,
      );
      await this.repository.addRefresh(tx, {
        tokenHash: nextHash,
        sessionId: session.id,
        tokenVersion: user.tokenVersion,
      });
      return {
        body: { accessToken },
        refreshToken: nextToken,
        maxAge: Math.max(
          0,
          Math.floor((session.expiresAt.getTime() - date.getTime()) / 1000),
        ),
      };
    });
    if (!result) throw new ApiException(10005);
    return result;
  }

  /** 退出只依赖 HttpOnly Cookie，账号级或身份级 access 过期仍可退出。 */
  async logout(refreshToken: string | undefined, metadata: LoginMetadata) {
    if (!refreshToken) return;
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    await this.repository.transaction(async (tx) => {
      const found = await this.repository.findRefresh(tx, tokenHash);
      if (!found || found.session.revokedAt || found.session.deletedAt) return;
      const date = new Date();
      await this.repository.revokeSession(tx, found.session.id, date);
      await this.repository.recordLogout(
        tx,
        found.user.id,
        found.session.id,
        metadata,
        date,
      );
    });
  }

  /** 改密保留当前会话，但升级账号版本并吊销该账号的其他会话。 */
  async changePassword(
    refreshToken: string | undefined,
    accessToken: string | undefined,
    input: ChangePasswordRequest,
    metadata: LoginMetadata,
  ) {
    if (!refreshToken) throw new ApiException(10005);
    const claims = await this.signer.verify(accessToken);
    if (!claims) throw new ApiException(10005);
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const result = await this.repository.transaction(async (tx) => {
      const refresh = await this.repository.findRefresh(tx, tokenHash);
      if (
        !refresh ||
        refresh.session.revokedAt ||
        refresh.session.deletedAt ||
        refresh.session.expiresAt <= new Date() ||
        refresh.session.refreshTokenHash !== tokenHash ||
        refresh.token.consumedAt ||
        refresh.user.deletedAt ||
        refresh.user.status !== 1 ||
        refresh.user.tokenVersion !== refresh.token.tokenVersion ||
        claims.userId !== refresh.user.id ||
        claims.sessionId !== refresh.session.id ||
        claims.tokenVersion !== refresh.user.tokenVersion
      ) {
        return { error: 10005 } as const;
      }
      if (
        !(await this.hasher.verify(
          refresh.user.passwordHash,
          input.oldPassword,
        ))
      ) {
        return { error: 10001 } as const;
      }
      const fields = validateNewPassword(
        this.config,
        refresh.user.username,
        input.newPassword,
      );
      const previous = await this.repository.recentPasswordHashes(
        tx,
        refresh.user.id,
        2,
      );
      const reused = await Promise.all(
        [
          refresh.user.passwordHash,
          ...previous.map((row) => row.passwordHash),
        ].map((passwordHash) =>
          this.hasher.verify(passwordHash, input.newPassword),
        ),
      );
      if (reused.some(Boolean)) fields.push("不能与最近 3 次密码相同");
      if (fields.length) {
        return {
          error: 10006,
          data: { fields: { newPassword: fields } },
        } as const;
      }
      const tokenVersion = refresh.user.tokenVersion + 1;
      const passwordHash = await this.hasher.hash(input.newPassword);
      const date = new Date();
      await this.repository.changePassword(tx, {
        userId: refresh.user.id,
        sessionId: refresh.session.id,
        previousHash: refresh.user.passwordHash,
        passwordHash,
        tokenVersion,
        date,
        metadata,
      });
      return { tokenVersion, sessionId: refresh.session.id };
    });
    if ("error" in result) {
      throw new ApiException(
        result.error,
        "data" in result ? result.data : null,
      );
    }
    return result;
  }
}
