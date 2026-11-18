import { randomBytes, randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  fileDownloadSchema,
  MAX_UPLOAD_BYTES,
  storedFileSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import { ObjectStorage } from "../../src/infra/storage/object-storage.js";
import {
  FileAccessService,
  FilesRepository,
} from "../../src/modules/foundation/files/index.js";
import { xlsFixture, xlsxFixture } from "../helpers/excel-files.js";
import { roleManagementFixture } from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let minio: StartedTestContainer;
let client: S3Client;
let school: Awaited<ReturnType<typeof f.seed>>, foreign: typeof school;
const bucket = "test-files";
beforeAll(async () => {
  const access = randomBytes(12).toString("hex"),
    secret = randomBytes(24).toString("hex");
  minio = await new GenericContainer("smart-sport-minio:2025-10-15")
    .withEnvironment({ MINIO_ROOT_USER: access, MINIO_ROOT_PASSWORD: secret })
    .withCommand(["server", "/data"])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
    .start();
  const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: access, secretAccessKey: secret },
  });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  f = await roleManagementFixture(false, {
    S3_ENDPOINT: endpoint,
    S3_REGION: "us-east-1",
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: access,
    S3_SECRET_ACCESS_KEY: secret,
  });
  school = await f.seed("school", "school-admin");
  foreign = await f.seed("school", "school-admin");
}, 120000);
afterAll(async () => {
  await f?.stop();
  client?.destroy();
  await minio?.stop();
}, 30000);
async function upload(
  buffer: Buffer,
  filename = "学生导入.xlsx",
  token = f.admin.token,
  path = "/files",
  key = randomUUID(),
  extra = false,
) {
  const form = new FormData();
  form.set("purpose", "import");
  form.set(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "application/octet-stream" }),
    filename,
  );
  if (extra) form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  return fetch(`${f.base}/api/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": key },
    body: form,
  });
}
const objectKeys = async () =>
  (
    await client.send(new ListObjectsV2Command({ Bucket: bucket }))
  ).Contents?.map((o) => o.Key).sort() ?? [];
it("真实xlsx/xls上传后从私有对象回读，哈希与元数据一致，幂等不重复写入", async () => {
  for (const [name, buffer] of [
    ["学生导入.xlsx", xlsxFixture()],
    ["旧版.xls", xlsFixture()],
  ] as const) {
    const key = randomUUID(),
      r = await upload(buffer, name, undefined, undefined, key);
    expect(r.status).toBe(201);
    const row = successResponseSchema(storedFileSchema).parse(
      await r.json(),
    ).data;
    expect(row.filename).toBe(name);
    expect(row.size).toBe(buffer.length);
    const meta = (
      await f.pool.query("SELECT * FROM public.files WHERE id=$1", [row.id])
    ).rows[0];
    expect(meta.object_key).toMatch(/^platform\/\d{4}\/\d{2}\/[a-f0-9-]+$/);
    expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.identity_id).toBe(f.admin.identityId);
    const download = await f.request(`/files/${row.id}/url`);
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toBe("no-store");
    const data = successResponseSchema(fileDownloadSchema).parse(
      await download.json(),
    ).data;
    const url = new URL(data.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    const read = await fetch(data.url);
    expect(read.status).toBe(200);
    expect(Buffer.from(await read.arrayBuffer())).toEqual(buffer);
    expect(read.headers.get("content-disposition")).toContain("attachment");
    url.search = "";
    expect((await fetch(url)).status).toBe(403);
    const repeat = await upload(buffer, name, undefined, undefined, key);
    expect(repeat.status).toBe(409);
    expect(await repeat.json()).toMatchObject({
      code: 90003,
      data: { id: row.id },
    });
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int AS n FROM public.files WHERE id=$1",
          [row.id],
        )
      ).rows[0].n,
    ).toBe(1);
  }
});
it("学校路径与身份归属隔离，其他学校和同校不同身份均404，账号令牌不能上传", async () => {
  const path = `/schools/${school.orgId}/files`;
  const r = await upload(xlsxFixture(), "本校.xlsx", school.token, path);
  expect(r.status).toBe(201);
  const data = successResponseSchema(storedFileSchema).parse(
    await r.json(),
  ).data;
  const local = await f.seed("school", "school-admin", school.orgId);
  for (const token of [foreign.token, local.token, f.admin.token])
    expect(
      (await f.request(`${path}/${data.id}/url`, "GET", undefined, token))
        .status,
    ).toBe(404);
  expect(
    (await f.request(`${path}/${data.id}/url`, "GET", undefined, school.token))
      .status,
  ).toBe(200);
  expect(
    (await f.request(`/files/${data.id}/url`, "GET", undefined, school.token))
      .status,
  ).toBe(404);
  expect(
    (
      await upload(
        xlsxFixture(),
        "越界.xlsx",
        school.token,
        `/schools/${foreign.orgId}/files`,
      )
    ).status,
  ).toBe(404);
  expect(
    (await upload(xlsxFixture(), "账号.xlsx", f.admin.account)).status,
  ).toBe(401);
  const bad = await fetch(`${f.base}/api/v1/files`, { method: "POST" });
  expect(bad.status).toBe(401);
});
it("不支持类型、伪造内容、空文件、多文件和超20MiB均拒绝且不留对象", async () => {
  const before = await objectKeys();
  for (const [name, buffer] of [
    ["a.exe", xlsxFixture()],
    ["a.xlsx", xlsFixture()],
    ["a.xls", xlsxFixture()],
    ["a.xls", xlsFixture("WordDocument")],
    ["empty.xlsx", Buffer.alloc(0)],
  ] as const) {
    const r = await upload(buffer, name);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: 90001 });
  }
  expect(
    (
      await upload(
        xlsxFixture(),
        "a.xlsx",
        undefined,
        undefined,
        undefined,
        true,
      )
    ).status,
  ).toBe(400);
  const oversized = await upload(Buffer.alloc(MAX_UPLOAD_BYTES + 1));
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toMatchObject({ code: 90006 });
  expect(await objectKeys()).toEqual(before);
});
it("超过1MiB的真实multipart可上传，20MiB上限包含边界", async () => {
  const buffer = xlsxFixture(MAX_UPLOAD_BYTES - xlsxFixture().length);
  const r = await upload(buffer, "大文件.xlsx");
  expect(r.status).toBe(201);
  expect(
    successResponseSchema(storedFileSchema).parse(await r.json()).data.size,
  ).toBe(MAX_UPLOAD_BYTES);
});
it("过期文件不签发链接，临近过期时签名寿命受剩余时间约束", async () => {
  const r = await upload(xlsxFixture());
  const data = successResponseSchema(storedFileSchema).parse(
    await r.json(),
  ).data;
  await f.pool.query(
    "UPDATE public.files SET expires_at=now()+interval '45 seconds' WHERE id=$1",
    [data.id],
  );
  const nearing = await f.request(`/files/${data.id}/url`);
  expect(nearing.status).toBe(200);
  const signed = successResponseSchema(fileDownloadSchema).parse(
    await nearing.json(),
  );
  expect(
    Number(new URL(signed.data.url).searchParams.get("X-Amz-Expires")),
  ).toBeLessThanOrEqual(45);
  await f.pool.query(
    "UPDATE public.files SET created_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE id=$1",
    [data.id],
  );
  expect((await f.request(`/files/${data.id}/url`)).status).toBe(404);
});
it("元数据失败补偿删除对象，存储失败不产生元数据", async () => {
  const repo = f.app.get(FilesRepository),
    storage = f.app.get(ObjectStorage);
  const before = await objectKeys();
  const count = Number(
    (await f.pool.query("SELECT count(*) FROM public.files")).rows[0].count,
  );
  const fail = vi
    .spyOn(repo, "create")
    .mockRejectedValueOnce(new Error("测试元数据失败"));
  try {
    expect((await upload(xlsxFixture())).status).toBe(500);
  } finally {
    fail.mockRestore();
  }
  expect(await objectKeys()).toEqual(before);
  const storeFail = vi
    .spyOn(storage, "put")
    .mockRejectedValueOnce(new Error("测试存储失败"));
  try {
    expect((await upload(xlsxFixture())).status).toBe(500);
  } finally {
    storeFail.mockRestore();
  }
  expect(
    Number(
      (await f.pool.query("SELECT count(*) FROM public.files")).rows[0].count,
    ),
  ).toBe(count);
});
it("签发和上传期间权限修订失效时丢弃结果，失败元数据不可下载", async () => {
  const r = await upload(xlsxFixture());
  const data = successResponseSchema(storedFileSchema).parse(
    await r.json(),
  ).data;
  const access = f.app.get(FileAccessService);
  const stale = vi
    .spyOn(access, "current")
    .mockRejectedValueOnce(new Error("测试读取期间撤权"));
  try {
    expect((await f.request(`/files/${data.id}/url`)).status).toBe(500);
  } finally {
    stale.mockRestore();
  }
  const original = access.current.bind(access);
  let checks = 0;
  const during = vi
    .spyOn(access, "current")
    .mockImplementation(async (revision) => {
      checks++;
      if (checks === 4) throw new Error("测试保存后修订失效");
      await original(revision);
    });
  try {
    expect((await upload(xlsxFixture())).status).toBe(500);
  } finally {
    during.mockRestore();
  }
  expect(
    (
      await f.pool.query(
        "SELECT count(*)::int AS n FROM public.files WHERE deleted_at IS NOT NULL",
      )
    ).rows[0].n,
  ).toBeGreaterThan(0);
});

it("同一账号的另一个组织身份不能读取原身份文件，停用后原令牌也不能签发链接", async () => {
  const response = await upload(xlsxFixture());
  const data = successResponseSchema(storedFileSchema).parse(
    await response.json(),
  ).data;
  const other = await f.seed("company", null);
  const signer = f.app.get(AccessTokenSigner);
  const claims = await signer.verify(other.token);
  if (!claims) throw new Error("测试身份令牌无效");
  await f.pool.query("UPDATE public.identities SET user_id=$1 WHERE id=$2", [
    f.admin.userId,
    other.identityId,
  ]);
  await f.pool.query("UPDATE public.user_sessions SET user_id=$1 WHERE id=$2", [
    f.admin.userId,
    claims.sessionId,
  ]);
  const token = await signer.signIdentity({
    userId: f.admin.userId,
    identityId: other.identityId,
    sessionId: claims.sessionId,
    tokenVersion: 0,
  });
  expect(
    (await f.request(`/files/${data.id}/url`, "GET", undefined, token)).status,
  ).toBe(404);
  const personal = await upload(xlsxFixture(), "个人.xlsx", token);
  expect(personal.status).toBe(201);
  const owned = successResponseSchema(storedFileSchema).parse(
    await personal.json(),
  ).data;
  expect(
    (await f.request(`/files/${owned.id}/url`, "GET", undefined, token)).status,
  ).toBe(200);
  await f.pool.query("UPDATE public.identities SET status=0 WHERE id=$1", [
    other.identityId,
  ]);
  expect(
    (await f.request(`/files/${owned.id}/url`, "GET", undefined, token)).status,
  ).toBe(403);
});
