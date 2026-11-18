import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const shared = "/mnt/data/smart-sport-m1/shared";
await mkdir(shared, { recursive: true, mode: 0o700 });
const password = () => randomBytes(32).toString("hex");
const dbPassword = password(),
  redis = password(),
  storage = password();
const privateKey = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "der" })
  .toString("base64");
const values = {
  NODE_ENV: "production",
  HOST: "127.0.0.1",
  PORT: "3000",
  DATABASE_URL: `postgresql://smart_sport_m1_app:${dbPassword}@192.168.2.16:5432/smart_sport_m1`,
  EXTRA_DATASOURCES: "{}",
  REDIS_PASSWORD: redis,
  REDIS_URL: `redis://:${redis}@127.0.0.1:16379/0`,
  MINIO_ROOT_USER: "smart_sport_m1",
  MINIO_ROOT_PASSWORD: storage,
  S3_ENDPOINT: "http://127.0.0.1:19000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "smart-sport-m1",
  S3_ACCESS_KEY_ID: "smart_sport_m1",
  S3_SECRET_ACCESS_KEY: storage,
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  STUDENT_HMAC_KEY: randomBytes(32).toString("base64"),
  JWT_PRIVATE_KEY: privateKey,
  JWT_KEY_ID: "m1-host-v1",
  WORKER_QUEUE_PREFIX: "smart-sport-m1",
};
try {
  await writeFile(
    `${shared}/app.env`,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    `${shared}/bootstrap-db.sql`,
    `\\set ON_ERROR_STOP on
SELECT format('CREATE ROLE smart_sport_m1_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', '${dbPassword}') WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='smart_sport_m1_app')\\gexec
SELECT 'CREATE DATABASE smart_sport_m1 OWNER smart_sport_m1_app' WHERE NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='smart_sport_m1')\\gexec
`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("已生成仅服务器保存的独立生产凭据，未输出密钥。");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("配置已存在，保持原密码与密钥。");
}
