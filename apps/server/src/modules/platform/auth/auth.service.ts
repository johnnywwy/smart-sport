import { createHash, createHmac, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import { type LoginRequest, loginResponseSchema } from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import { AccessTokenSigner } from "../../../infra/auth/access-token-signer.js";
import { PasswordHasher } from "../../../infra/crypto/password-hasher.js";
import { SERVER_CONFIG } from "../../../server-config.js";
import { AuthRepository, type LoginMetadata } from "./auth.repository.js";

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(AccessTokenSigner) private readonly signer: AccessTokenSigner,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
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
      return {
        body: loginResponseSchema.parse({
          accessToken,
          mustChangePassword: user.mustChangePassword,
          identityCount,
        }),
        refreshToken,
      };
    });
    // 失败记录先提交，再抛出 HTTP 错误，避免事务回滚丢失日志。
    if ("error" in result) throw new ApiException(result.error);
    return result;
  }
}
