import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// 独立临时配置，不读取开发者的 .env，也不连接外部服务。
const { privateKey } = generateKeyPairSync("ed25519");
const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://probe:probe@127.0.0.1:1/probe",
  REDIS_URL: "redis://:probe@127.0.0.1:1/0",
  S3_ENDPOINT: "http://127.0.0.1:1",
  S3_REGION: "us-east-1",
  S3_BUCKET: "probe-bucket",
  S3_ACCESS_KEY_ID: "probe-access",
  S3_SECRET_ACCESS_KEY: randomBytes(32).toString("base64url"),
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  STUDENT_HMAC_KEY: randomBytes(32).toString("base64"),
  JWT_KEY_ID: "probe-v1",
  JWT_PRIVATE_KEY: privateKey
    .export({ type: "pkcs8", format: "der" })
    .toString("base64"),
};
for (const role of ["server", "worker"]) {
  const keys = Object.keys(valid).filter(
    (key) => role === "server" || !key.startsWith("JWT_"),
  );
  for (const key of keys) {
    const env = { ...valid };
    delete env[key];
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(`../apps/${role}/dist/main.js`, import.meta.url))],
      { env, encoding: "utf8", timeout: 5000 },
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.error, undefined, `${role}/${key}: 进程未正常结束`);
    assert.notEqual(result.status, 0, `${role}/${key}: 缺失变量未阻止启动`);
    assert.ok(
      output.includes(`环境变量缺失或格式无效：${key}`),
      `${role}/${key}: 缺少明确变量名`,
    );
    assert.ok(
      !output.includes("Nest application successfully started"),
      `${role}/${key}: 校验过晚`,
    );
    for (const secret of [
      valid.JWT_PRIVATE_KEY,
      valid.S3_SECRET_ACCESS_KEY,
      valid.FIELD_ENCRYPTION_KEY,
      valid.STUDENT_HMAC_KEY,
      valid.DATABASE_URL,
    ]) {
      assert.ok(!output.includes(secret), `${role}/${key}: 日志包含配置值`);
    }
  }
  console.log(
    `${role}: ${keys.length} required-variable startup failures verified`,
  );
}
