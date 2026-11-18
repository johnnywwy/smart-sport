import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

it("开发与测试共用精确版本，PostgreSQL18使用新卷和官方父级挂载目录", () => {
  const compose = readFileSync(
    new URL("../../../../deploy/compose.dev.yaml", import.meta.url),
    "utf8",
  );
  expect(POSTGRES_IMAGE).toMatch(/^postgres:18\.6-alpine\d+\.\d+$/);
  expect(compose).toContain(`image: ${POSTGRES_IMAGE}`);
  expect(compose).toContain("postgres18-data:/var/lib/postgresql");
  expect(compose).not.toContain("postgres-data:/var/lib/postgresql/data");
  expect(compose).toContain("\n  postgres-data:");
});
