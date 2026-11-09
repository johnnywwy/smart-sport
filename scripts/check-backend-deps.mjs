import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// 从各 workspace 解析依赖，避免根目录的提升依赖掩盖缺失声明。
for (const workspace of ["server", "worker"]) {
  const manifest = new URL(
    `../apps/${workspace}/package.json`,
    import.meta.url,
  );
  const { dependencies } = JSON.parse(await readFile(manifest, "utf8"));
  const require = createRequire(manifest);
  for (const name of Object.keys(dependencies)) {
    await import(pathToFileURL(require.resolve(name)).href);
  }
  const load = (name) => import(pathToFileURL(require.resolve(name)).href);
  const { Module } = await load("@nestjs/common");
  const { NestFactory } = await load("@nestjs/core");
  class DependencyProbe {}
  Module({})(DependencyProbe);
  const context = await NestFactory.createApplicationContext(DependencyProbe, {
    logger: false,
  });
  await context.close();
  const { z } = await load("zod");
  assert.equal(z.string().parse("ok"), "ok");
  const { S3Client } = await load("@aws-sdk/client-s3");
  const client = new S3Client({ region: "us-east-1" });
  client.destroy();
  if (workspace === "server") {
    const { hash, verify, argon2id } = await load("argon2");
    const encoded = await hash("dependency-check-only", { type: argon2id });
    assert.match(encoded, /^\$argon2id\$/);
    assert.equal(await verify(encoded, "dependency-check-only"), true);
    assert.equal(await verify(encoded, "incorrect-password"), false);
    const { generateKeyPair, SignJWT, jwtVerify } = await load("jose");
    const { publicKey, privateKey } = await generateKeyPair("EdDSA");
    const token = await new SignJWT({ probe: true })
      .setProtectedHeader({ alg: "EdDSA" })
      .setExpirationTime("1m")
      .sign(privateKey);
    assert.equal(
      (await jwtVerify(token, publicKey, { algorithms: ["EdDSA"] })).payload
        .probe,
      true,
    );
  }
  console.log(`${workspace}: all runtime imports and Nest ESM context passed`);
}
console.log(
  "argon2id hash/verify and jose EdDSA sign/verify passed; no external service connections tested.",
);
