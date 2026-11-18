import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../server/package.json", import.meta.url),
);
const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");
const { loadConfig } = require("@smart-sport/config/env");
const config = loadConfig("server");
const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
});
try {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET }));
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
  }
  console.log("MinIO专用桶已就绪（保持私有）。");
} finally {
  s3.destroy();
}
const base = process.argv[2] ?? "https://sport.johnnywwy.com";
if (
  !new Set(["https://sport.johnnywwy.com", "http://127.0.0.1:18082"]).has(base)
)
  throw new Error("不允许向其他地址提交生产凭据");
const request = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, Connection: "close" },
    signal: AbortSignal.timeout(20000),
  });
const credentials = await readFile(
  "/mnt/data/smart-sport-m1/shared/initial-admin.txt",
  "utf8",
);
const password = credentials
  .split("\n")
  .find((line) => line.startsWith("password="))
  ?.slice(9);
const login = await request(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "admin", password }),
});
const result = await login.json();
if (login.status !== 200 || result.code !== 0)
  throw new Error(`登录验收失败: ${login.status}/${result.code}`);
const cookie = login.headers.getSetCookie()[0];
if (
  !cookie?.includes("HttpOnly") ||
  !cookie.includes("Secure") ||
  !cookie.includes("SameSite=Strict")
)
  throw new Error("生产Cookie属性不完整");
let currentCookie = cookie.split(";")[0];
try {
  console.log("初始管理员登录成功，首次改密:", result.data.mustChangePassword);
  const refresh = await request(`${base}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { Cookie: currentCookie },
  });
  const body = await refresh.json();
  const refreshedCookie = refresh.headers.getSetCookie()[0];
  if (refreshedCookie) currentCookie = refreshedCookie.split(";")[0];
  if (refresh.status !== 200 || body.code !== 0)
    throw new Error(`刷新登录失败: ${refresh.status}/${body.code}`);
  console.log("刷新成功，HttpOnly/Secure/SameSite Cookie已验证。");
  const session = await request(`${base}/api/v1/auth/session`, {
    headers: { Authorization: `Bearer ${body.data.accessToken}` },
  });
  if (session.status !== 200)
    throw new Error(`会话恢复失败: ${session.status}`);
  console.log("真实认证会话恢复成功。");
} finally {
  const logout = await request(`${base}/api/v1/auth/logout`, {
    method: "POST",
    headers: { Cookie: currentCookie },
  });
  if (logout.status !== 200) {
    console.error(`验收会话退出失败:${logout.status}`);
    process.exitCode = 1;
  } else {
    console.log("验收会话已退出，未修改初始密码。");
  }
}
for (const path of ["/", "/m/platform-admin/menu-overrides", "/health/ready"]) {
  const response = await request(`${base}${path}`);
  if (response.status !== 200)
    throw new Error(`入口验收失败: ${path}/${response.status}`);
  console.log(path, response.status);
}
