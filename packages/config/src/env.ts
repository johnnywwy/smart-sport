import { createPrivateKey } from "node:crypto";
import { z } from "zod";

const nonempty = z.string().trim().min(1);
const url = (protocols: string[]) =>
  z
    .string()
    .url()
    .refine(
      (value) =>
        URL.canParse(value) && protocols.includes(new URL(value).protocol),
    );
const key32 = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .refine((value) => Buffer.from(value, "base64").length === 32);
const databaseSchema = z.object({
  DATABASE_URL: url(["postgres:", "postgresql:"]),
  EXTRA_DATASOURCES: z
    .string()
    .default("{}")
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "需要 JSON 对象" });
        return z.NEVER;
      }
    })
    .pipe(
      z.record(
        z.string().regex(/^(?!default$)[a-z][a-z0-9_]*$/),
        url(["postgres:", "postgresql:"]),
      ),
    ),
});

export type DatabaseConfig = z.infer<typeof databaseSchema>;

export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const result = databaseSchema.safeParse(env);
  if (!result.success) {
    const names = new Set(result.error.issues.map(({ path }) => path[0]));
    throw new Error(`数据库环境变量缺失或格式无效：${[...names].join(", ")}`);
  }
  return result.data;
}

const shared = {
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: url(["postgres:", "postgresql:"]),
  REDIS_URL: url(["redis:", "rediss:"]),
  S3_ENDPOINT: url(["http:", "https:"]),
  S3_REGION: nonempty,
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  S3_ACCESS_KEY_ID: nonempty,
  S3_SECRET_ACCESS_KEY: z.string().min(16),
  FIELD_ENCRYPTION_KEY: key32,
  STUDENT_HMAC_KEY: key32,
};
const workerSchema = z.object(shared);
const serverSchema = workerSchema.extend({
  HOST: nonempty.default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_KEY_ID: nonempty,
  JWT_PRIVATE_KEY: nonempty.refine((value) => {
    try {
      return (
        createPrivateKey({
          key: Buffer.from(value, "base64"),
          format: "der",
          type: "pkcs8",
        }).asymmetricKeyType === "ed25519"
      );
    } catch {
      return false;
    }
  }),
});

export type ServerConfig = Readonly<
  z.infer<typeof serverSchema> & {
    apiDocsEnabled: boolean;
    demoSeedEnabled: boolean;
  }
>;
export type WorkerConfig = Readonly<
  z.infer<typeof workerSchema> & {
    apiDocsEnabled: boolean;
    demoSeedEnabled: boolean;
  }
>;

export function loadConfig(
  role: "server",
  env?: NodeJS.ProcessEnv,
): ServerConfig;
export function loadConfig(
  role: "worker",
  env?: NodeJS.ProcessEnv,
): WorkerConfig;
export function loadConfig(
  role: "server" | "worker",
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig | WorkerConfig {
  const parsed = (role === "server" ? serverSchema : workerSchema).safeParse(
    env,
  );
  if (!parsed.success) {
    // 不输出 Zod 原始 issue/input，避免连接串及密钥进入日志。
    const names = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`环境变量缺失或格式无效：${names.join(", ")}`);
  }
  return Object.freeze({
    ...parsed.data,
    apiDocsEnabled: parsed.data.NODE_ENV !== "production",
    demoSeedEnabled: parsed.data.NODE_ENV !== "production",
  });
}
