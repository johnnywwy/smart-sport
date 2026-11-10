import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { expect, it } from "vitest";
import { loadConfig } from "./src/env.js";

it("generates a complete private env file and preserves it on subsequent runs", () => {
  const directory = mkdtempSync(join(tmpdir(), "smart-sport-env-test-"));
  try {
    mkdirSync(join(directory, "scripts"));
    writeFileSync(
      join(directory, "scripts/init-env.mjs"),
      readFileSync(new URL("../../scripts/init-env.mjs", import.meta.url)),
    );
    writeFileSync(
      join(directory, ".env.example"),
      readFileSync(new URL("../../.env.example", import.meta.url)),
    );
    const generate = () =>
      spawnSync(process.execPath, [join(directory, "scripts/init-env.mjs")], {
        encoding: "utf8",
      });
    expect(generate().status).toBe(0);
    const content = readFileSync(join(directory, ".env"), "utf8");
    const env = parseEnv(content);
    expect(() => loadConfig("server", env)).not.toThrow();
    expect(env.S3_SECRET_ACCESS_KEY).toBe(env.MINIO_ROOT_PASSWORD);
    expect(new URL(env.DATABASE_URL ?? "").password).toBe(
      env.POSTGRES_PASSWORD,
    );
    expect(new URL(env.REDIS_URL ?? "").password).toBe(env.REDIS_PASSWORD);
    expect(statSync(join(directory, ".env")).mode & 0o777).toBe(0o600);
    expect(generate().status).toBe(0);
    expect(readFileSync(join(directory, ".env"), "utf8")).toBe(content);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
