import { generateKeyPairSync } from "node:crypto";
import type { ServerConfig } from "@smart-sport/config/env";
import { decodeJwt, decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import { v7 } from "uuid";
import { describe, expect, it } from "vitest";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";

const pair = generateKeyPairSync("ed25519");
const config: Pick<ServerConfig, "JWT_PRIVATE_KEY" | "JWT_KEY_ID"> = {
  JWT_PRIVATE_KEY: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  JWT_KEY_ID: "test-signing-key-v1",
};
const signer = new AccessTokenSigner(config as ServerConfig);
const input = { userId: v7(), sessionId: v7(), tokenVersion: 3 };

describe("账号级 access token", () => {
  it("使用 EdDSA 签名，携带 kid，并可由公钥验证", async () => {
    const token = await signer.signAccount(input);
    expect(decodeProtectedHeader(token)).toEqual({
      alg: "EdDSA",
      kid: config.JWT_KEY_ID,
      typ: "JWT",
    });
    const { payload } = await jwtVerify(token, pair.publicKey, {
      algorithms: ["EdDSA"],
    });
    expect(payload).toMatchObject({
      sub: input.userId,
      sid: input.sessionId,
      tv: 3,
      client: "admin",
      stage: "account",
    });
    expect(payload).not.toHaveProperty("iid");
    expect(Object.keys(payload).sort()).toEqual([
      "client",
      "exp",
      "iat",
      "sid",
      "stage",
      "sub",
      "tv",
    ]);
  });

  it("有效期严格为 10 分钟，过期后验证失败", async () => {
    const token = await signer.signAccount(input);
    const { iat, exp } = decodeJwt(token);
    expect(exp).toBe((iat ?? 0) + 600);
    await expect(
      jwtVerify(token, pair.publicKey, {
        currentDate: new Date((exp ?? 0) * 1000),
      }),
    ).rejects.toMatchObject({ code: "ERR_JWT_EXPIRED" });
  });

  it("不接受其他密钥签发的令牌", async () => {
    const other = generateKeyPairSync("ed25519");
    const token = await signer.signAccount(input);
    await expect(jwtVerify(token, other.publicKey)).rejects.toMatchObject({
      code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    });
  });

  it("每次使用业务传入的会话和版本，不混用身份", async () => {
    const next = { userId: v7(), sessionId: v7(), tokenVersion: 4 };
    const token = await signer.signAccount(next);
    expect((await jwtVerify(token, pair.publicKey)).payload).toMatchObject({
      sub: next.userId,
      sid: next.sessionId,
      tv: 4,
      stage: "account",
    });
  });

  it("从配置读取新的签名密钥与 kid", async () => {
    const nextPair = generateKeyPairSync("ed25519");
    const nextSigner = new AccessTokenSigner({
      ...config,
      JWT_PRIVATE_KEY: nextPair.privateKey
        .export({ format: "der", type: "pkcs8" })
        .toString("base64"),
      JWT_KEY_ID: "test-signing-key-v2",
    } as ServerConfig);
    const token = await nextSigner.signAccount(input);
    expect(
      (await jwtVerify(token, nextPair.publicKey)).protectedHeader.kid,
    ).toBe("test-signing-key-v2");
    await expect(jwtVerify(token, pair.publicKey)).rejects.toMatchObject({
      code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
    });
  });
});

describe("后台令牌声明验证", () => {
  it("拒绝未设置过期时间的签名令牌", async () => {
    const token = await new SignJWT({
      sub: input.userId,
      sid: input.sessionId,
      tv: 3,
      client: "admin",
      stage: "account",
    })
      .setProtectedHeader({ alg: "EdDSA" })
      .sign(pair.privateKey);
    expect(await signer.verify(token)).toBeUndefined();
  });

  it("还原账号和身份阶段，只接受合法UUID和版本", async () => {
    expect(await signer.verify(await signer.signAccount(input))).toEqual({
      ...input,
      stage: "account",
    });
    const identityId = v7();
    expect(
      await signer.verify(await signer.signIdentity({ ...input, identityId })),
    ).toEqual({ ...input, identityId, stage: "identity" });
  });
  it.each([
    { tv: -1 },
    { tv: 0.5 },
    { sid: "invalid" },
    { sub: "invalid" },
    { client: "mobile" },
    { stage: "identity" },
    { stage: "unknown" },
    { exp: 1 },
  ])("拒绝签名正确但声明无效的令牌：%j", async (override) => {
    const token = await new SignJWT({
      sub: input.userId,
      sid: input.sessionId,
      tv: 3,
      client: "admin",
      stage: "account",
      exp: Math.floor(Date.now() / 1000) + 600,
      ...override,
    })
      .setProtectedHeader({ alg: "EdDSA" })
      .sign(pair.privateKey);
    expect(await signer.verify(token)).toBeUndefined();
  });
});
