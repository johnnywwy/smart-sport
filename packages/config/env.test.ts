import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./src/env.js";

const { privateKey } = generateKeyPairSync("ed25519");
const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:secret@localhost:15432/test",
  REDIS_URL: "redis://:secret@localhost:16379/0",
  S3_ENDPOINT: "http://localhost:19000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "test-bucket",
  S3_ACCESS_KEY_ID: "test-access",
  S3_SECRET_ACCESS_KEY: randomBytes(32).toString("base64url"),
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  STUDENT_HMAC_KEY: randomBytes(32).toString("base64"),
  JWT_KEY_ID: "test-v1",
  JWT_PRIVATE_KEY: privateKey
    .export({ type: "pkcs8", format: "der" })
    .toString("base64"),
};

describe("environment validation", () => {
  it.each(["development", "test", "production"])(
    "supports %s without unsafe production defaults",
    (NODE_ENV) => {
      const config = loadConfig("server", { ...valid, NODE_ENV });
      expect(config.PORT).toBe(3000);
      expect(config.apiDocsEnabled).toBe(NODE_ENV !== "production");
      expect(config.demoSeedEnabled).toBe(NODE_ENV !== "production");
      expect(Object.isFrozen(config)).toBe(true);
    },
  );
  it.each(Object.keys(valid))(
    "rejects missing %s and does not expose secrets",
    (key) => {
      const env: NodeJS.ProcessEnv = { ...valid };
      delete env[key];
      expect(() => loadConfig("server", env)).toThrow(key);
      try {
        loadConfig("server", env);
      } catch (error) {
        expect(String(error)).not.toContain(valid.S3_SECRET_ACCESS_KEY);
        expect(String(error)).not.toContain(valid.JWT_PRIVATE_KEY);
        expect(String(error)).not.toContain(valid.DATABASE_URL);
      }
    },
  );
  it.each([
    ["NODE_ENV", "staging"],
    ["PORT", ""],
    ["PORT", "0"],
    ["PORT", "65536"],
    ["DATABASE_URL", "https://localhost"],
    ["DATABASE_URL", "not-a-url"],
    ["REDIS_URL", "not-a-url"],
    ["S3_ENDPOINT", "not-a-url"],
    ["REDIS_URL", "http://localhost"],
    ["S3_ENDPOINT", "ftp://localhost"],
    ["S3_BUCKET", "Bad Bucket"],
    ["FIELD_ENCRYPTION_KEY", "short"],
    ["STUDENT_HMAC_KEY", "short"],
    ["JWT_PRIVATE_KEY", "bad-key"],
  ])("rejects invalid %s", (key, value) => {
    expect(() => loadConfig("server", { ...valid, [key]: value })).toThrow(key);
  });
  it("does not require signing keys in workers", () => {
    const { JWT_PRIVATE_KEY: _key, JWT_KEY_ID: _id, ...worker } = valid;
    expect(loadConfig("worker", worker).NODE_ENV).toBe("test");
    for (const key of Object.keys(worker)) {
      const env: NodeJS.ProcessEnv = { ...worker };
      delete env[key];
      expect(() => loadConfig("worker", env)).toThrow(key);
    }
  });
  it("rejects non-Ed25519 signing keys", () => {
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(() =>
      loadConfig("server", {
        ...valid,
        JWT_PRIVATE_KEY: pair.privateKey
          .export({ type: "pkcs8", format: "der" })
          .toString("base64"),
      }),
    ).toThrow("JWT_PRIVATE_KEY");
  });
  it("never includes unknown environment secrets in parsed output", () => {
    expect(
      loadConfig("server", { ...valid, UNRELATED_SECRET: "not-for-this-app" }),
    ).not.toHaveProperty("UNRELATED_SECRET");
  });
});
