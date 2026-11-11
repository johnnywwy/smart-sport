import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import { idSchema } from "@smart-sport/contracts";
import { jwtVerify, SignJWT } from "jose";
import { SERVER_CONFIG } from "../../server-config.js";

type AccountTokenInput = {
  userId: string;
  sessionId: string;
  tokenVersion: number;
};

@Injectable()
export class AccessTokenSigner {
  private readonly key: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly keyId: string;

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.key = createPrivateKey({
      key: Buffer.from(config.JWT_PRIVATE_KEY, "base64"),
      format: "der",
      type: "pkcs8",
    });
    this.keyId = config.JWT_KEY_ID;
    if (this.key.asymmetricKeyType !== "ed25519") {
      throw new Error("令牌签名需要 Ed25519 密钥");
    }
    this.publicKey = createPublicKey(this.key);
  }

  /** 登录成功后签发账号级令牌；会话必须由业务层先持久化。 */
  signAccount(input: AccountTokenInput): Promise<string> {
    return new SignJWT({
      sid: input.sessionId,
      tv: input.tokenVersion,
      client: "admin",
      stage: "account",
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.keyId, typ: "JWT" })
      .setSubject(input.userId)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(this.key);
  }
  /** 刷新时阶段以数据库会话为准，不接受客户端指定身份。 */
  signIdentity(
    input: AccountTokenInput & { identityId: string },
  ): Promise<string> {
    return new SignJWT({
      sid: input.sessionId,
      tv: input.tokenVersion,
      iid: input.identityId,
      client: "admin",
      stage: "identity",
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.keyId, typ: "JWT" })
      .setSubject(input.userId)
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(this.key);
  }

  /** 验证签名、有效期及后台令牌声明。 */
  async verify(token: string | undefined) {
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: ["EdDSA"],
      });
      if (
        !idSchema.safeParse(payload.sub).success ||
        !idSchema.safeParse(payload.sid).success ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.exp !== "number" ||
        typeof payload.tv !== "number" ||
        !Number.isSafeInteger(payload.tv) ||
        Number(payload.tv) < 0 ||
        payload.client !== "admin" ||
        (payload.stage !== "account" && payload.stage !== "identity")
      ) {
        return undefined;
      }
      if (
        payload.stage === "identity" &&
        (typeof payload.iid !== "string" ||
          !idSchema.safeParse(payload.iid).success)
      ) {
        return undefined;
      }
      return {
        userId: payload.sub,
        sessionId: payload.sid,
        tokenVersion: payload.tv,
        stage: payload.stage,
        ...(payload.stage === "identity" ? { identityId: payload.iid } : {}),
      };
    } catch {
      return undefined;
    }
  }
}
