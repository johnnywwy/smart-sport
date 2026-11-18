import { appendFileSync, readFileSync } from "node:fs";
import { POSTGRES_IMAGE } from "../apps/server/tests/helpers/postgres-image.ts";

// 镜像始终取自开发编排；PostgreSQL 复用集成测试的同一个常量。
const compose = readFileSync(
  new URL("../deploy/compose.dev.yaml", import.meta.url),
  "utf8",
);
function imageFor(service) {
  const image = compose.match(
    new RegExp(`^  ${service}:\\n    image: ([^\\s]+)$`, "m"),
  )?.[1];
  if (!image) throw new Error(`开发编排缺少 ${service} 镜像`);
  return image;
}
const images = {
  postgres: POSTGRES_IMAGE,
  redis: imageFor("redis"),
  minio: imageFor("minio"),
};
const output = Object.entries(images)
  .map(([service, image]) => `${service}=${image}\n`)
  .join("");
const outputPath = process.argv[2];
if (outputPath) appendFileSync(outputPath, output);
else process.stdout.write(output);
