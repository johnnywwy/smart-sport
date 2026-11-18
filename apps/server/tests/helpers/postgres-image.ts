import { readFileSync } from "node:fs";

// 开发编排是唯一镜像版本来源，CI和本地Testcontainers必须与它保持一致。
const compose = readFileSync(
  new URL("../../../../deploy/compose.dev.yaml", import.meta.url),
  "utf8",
);
const image =
  /^ {2}postgres:\s*\n {4}image: (postgres:\d+\.\d+-alpine\d+\.\d+)$/m.exec(
    compose,
  )?.[1];
if (!image) throw new Error("开发编排缺少精确PostgreSQL官方镜像标签");
export const POSTGRES_IMAGE = image;
