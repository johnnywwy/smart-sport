import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
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

  /** 全局 AuthGuard 上线前，只供认证模块验证自身接口所需的核心字段。 */
  async verify(token: string | undefined) {
    if (!token) return undefined;
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: ["EdDSA"],
      });
      if (
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.tv !== "number" ||
        payload.client !== "admin" ||
        (payload.stage !== "account" && payload.stage !== "identity")
      ) {
        return undefined;
      }
      return {
        userId: payload.sub,
        sessionId: payload.sid,
        tokenVersion: payload.tv,
      };
    } catch {
      return undefined;
    }
  }
}
