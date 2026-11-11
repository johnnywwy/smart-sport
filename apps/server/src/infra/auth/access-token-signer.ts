import { createPrivateKey, type KeyObject } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import { SignJWT } from "jose";
import { SERVER_CONFIG } from "../../server-config.js";

type AccountTokenInput = {
  userId: string;
  sessionId: string;
  tokenVersion: number;
};

@Injectable()
export class AccessTokenSigner {
  private readonly key: KeyObject;
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
}
