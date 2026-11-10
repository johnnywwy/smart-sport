import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const template = await readFile(new URL(".env.example", root), "utf8");
const secret = () => randomBytes(32).toString("base64url");
const databasePassword = secret();
const redisPassword = secret();
const storagePassword = secret();
const { privateKey } = generateKeyPairSync("ed25519");
const values = {
  POSTGRES_PASSWORD: databasePassword,
  REDIS_PASSWORD: redisPassword,
  MINIO_ROOT_PASSWORD: storagePassword,
  DATABASE_URL: `postgresql://smart_sport:${databasePassword}@127.0.0.1:15432/smart_sport`,
  REDIS_URL: `redis://:${redisPassword}@127.0.0.1:16379/0`,
  S3_SECRET_ACCESS_KEY: storagePassword,
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  STUDENT_HMAC_KEY: randomBytes(32).toString("base64"),
  JWT_PRIVATE_KEY: privateKey
    .export({ type: "pkcs8", format: "der" })
    .toString("base64"),
};
const content = template.replace(/^([A-Z0-9_]+)=$/gm, (line, name) =>
  name in values ? `${name}=${values[name]}` : line,
);
try {
  await writeFile(new URL(".env", root), content, { flag: "wx", mode: 0o600 });
  console.log("已生成 .env（仅本地使用，权限 0600），请勿提交或分享。");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env 已存在，保持原有配置与密钥。");
}
