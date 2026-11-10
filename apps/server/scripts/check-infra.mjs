import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadConfig } from "@smart-sport/config/env";
import { Redis } from "ioredis";
import pg from "pg";

const config = loadConfig("worker");
if (config.NODE_ENV === "production")
  throw new Error("开发环境检查禁止在 production 下运行");
const database = new pg.Client({
  connectionString: config.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  retryStrategy: () => null,
  maxRetriesPerRequest: 0,
  connectTimeout: 5000,
});
redis.on("error", () => {});
const storage = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 },
});
const id = randomUUID();
const bucket = `smart-sport-check-${id}`;
let createdBucket = false;
let createdObject = false;
try {
  await database.connect();
  const result = await database.query("SELECT 1 AS value");
  assert.equal(result.rows[0].value, 1);
  console.log("PostgreSQL: authenticated query passed");
  await redis.connect();
  await redis.set(`check:${id}`, "ok", "EX", 30);
  assert.equal(await redis.get(`check:${id}`), "ok");
  console.log("Redis: authenticated read/write passed");
  await storage.send(new CreateBucketCommand({ Bucket: bucket }));
  createdBucket = true;
  await storage.send(
    new PutObjectCommand({ Bucket: bucket, Key: "probe", Body: "ok" }),
  );
  createdObject = true;
  const object = await storage.send(
    new GetObjectCommand({ Bucket: bucket, Key: "probe" }),
  );
  assert.equal(await object.Body.transformToString(), "ok");
  console.log("MinIO: authenticated S3 upload/download passed");
} catch {
  console.error(
    "基础设施联通检查失败，请检查 infra:status 与本地配置（不输出凭据）。",
  );
  process.exitCode = 1;
} finally {
  try {
    if (createdObject)
      await storage.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: "probe" }),
      );
    if (createdBucket)
      await storage.send(new DeleteBucketCommand({ Bucket: bucket }));
    if (redis.status === "ready") await redis.del(`check:${id}`);
  } catch {
    console.error("临时检查数据清理失败，请检查服务状态。");
    process.exitCode = 1;
  } finally {
    redis.disconnect();
    storage.destroy();
    await database.end();
  }
}
