import { Redis } from "ioredis";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ContextCache } from "../../src/modules/platform/identity-context/context-cache.js";
import { ScopeCache } from "../../src/modules/platform/scope/scope-cache.js";

let container: StartedTestContainer;
let redis: Redis;
let contexts: ContextCache;
let scopes: ScopeCache;
beforeAll(async () => {
  container = await new GenericContainer("redis:8.10.3-alpine3.23")
    .withExposedPorts(6379)
    .start();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  redis = new Redis(url);
  contexts = new ContextCache(url);
  scopes = new ScopeCache(url);
  await contexts.subscribe();
  await contexts.observeDatabaseRevision("12");
}, 120000);
afterAll(async () => {
  scopes?.close();
  await contexts?.close();
  redis?.disconnect();
  await container?.stop();
}, 30000);
const revision = async () =>
  `${await redis.get("ctx:database-revision")}:${await contexts.revision()}`;

it("小集合与全量使用JSON，TTL十分钟，按身份与选项隔离", async () => {
  const id = v7();
  const schoolId = v7();
  const rev = await revision();
  expect(
    await scopes.write(id, "personal", rev, {
      kind: "schools",
      schoolIds: [schoolId],
    }),
  ).toBe(true);
  expect(await scopes.read(id, "personal", rev)).toEqual({
    kind: "schools",
    schoolIds: [schoolId],
  });
  expect(await scopes.contains(id, "personal", rev, schoolId)).toBe(true);
  expect(await scopes.contains(id, "personal", rev, v7())).toBe(false);
  expect(
    await scopes.contains(v7(), "personal", rev, schoolId),
  ).toBeUndefined();
  expect(await scopes.contains(id, "dept", rev, schoolId)).toBeUndefined();
  expect(await redis.ttl(`scope:${id}:personal`)).toBeGreaterThan(590);
  expect(await redis.exists(`scope:${id}:personal:schools`)).toBe(0);
  expect(await scopes.write(id, "all", rev, { kind: "all-schools" })).toBe(
    true,
  );
  expect(await scopes.contains(id, "all", rev, schoolId)).toBe("all");
});

it("大集合以Redis Set存储并做成员判断，集合丢失时是miss而不是空范围", async () => {
  const id = v7();
  const ids = Array.from({ length: 501 }, () => v7()).sort();
  const first = ids[0];
  const second = ids[1];
  const last = ids[500];
  if (!first || !second || !last) throw new Error("缺少测试学校");
  const rev = await revision();
  await scopes.write(id, "dept", rev, { kind: "schools", schoolIds: ids });
  const key = `scope:${id}:dept`;
  expect(await redis.type(`${key}:schools`)).toBe("set");
  expect(await redis.scard(`${key}:schools`)).toBe(501);
  expect(await redis.ttl(`${key}:schools`)).toBeGreaterThan(590);
  expect(JSON.parse((await redis.get(key)) ?? "null").scope.schoolIds).toEqual(
    [],
  );
  expect(await scopes.contains(id, "dept", rev, last)).toBe(true);
  expect(await scopes.contains(id, "dept", rev, v7())).toBe(false);
  expect(await scopes.read(id, "dept", rev)).toEqual({
    kind: "schools",
    schoolIds: ids,
  });
  await redis.srem(`${key}:schools`, first);
  expect(await scopes.contains(id, "dept", rev, second)).toBeUndefined();
  expect(await scopes.read(id, "dept", rev)).toBeUndefined();
  await redis.del(`${key}:schools`);
  expect(await scopes.contains(id, "dept", rev, second)).toBeUndefined();
});

it("大集合切换小集合时清除副键，损坏JSON不能变成授权命中", async () => {
  const id = v7();
  const rev = await revision();
  await scopes.write(id, "dept", rev, {
    kind: "schools",
    schoolIds: Array.from({ length: 501 }, () => v7()),
  });
  await scopes.write(id, "dept", rev, { kind: "schools", schoolIds: [] });
  expect(await redis.exists(`scope:${id}:dept:schools`)).toBe(0);
  expect(await scopes.contains(id, "dept", rev, v7())).toBe(false);
  await redis.set(`scope:${id}:dept`, "invalid-json");
  expect(await scopes.read(id, "dept", rev)).toBeUndefined();
  expect(await scopes.contains(id, "dept", rev, v7())).toBeUndefined();
});

it("身份失效同时清除集合副键，旧版本不能回填，迟到广播不删除新版本", async () => {
  const id = v7();
  const ids = Array.from({ length: 501 }, () => v7()).sort();
  const old = await revision();
  await scopes.write(id, "dept", old, { kind: "schools", schoolIds: ids });
  await contexts.invalidate([id]);
  expect(
    await redis.exists(`scope:${id}:dept`, `scope:${id}:dept:schools`),
  ).toBe(0);
  expect(
    await scopes.write(id, "dept", old, { kind: "schools", schoolIds: ids }),
  ).toBe(false);
  expect(await scopes.read(id, "dept", old)).toBeUndefined();
  const current = await revision();
  await scopes.write(id, "dept", current, { kind: "schools", schoolIds: ids });
  await redis.publish("ctx:invalidate", "delayed-old-event");
  // 订阅者确实处理了广播，再检查新版本未受影响。
  const sentinel = v7();
  await redis.set(`scope:${sentinel}:personal`, "stale");
  await redis.publish("ctx:invalidate", "prune");
  await expect.poll(() => redis.exists(`scope:${sentinel}:personal`)).toBe(0);
  expect(await scopes.read(id, "dept", current)).toEqual({
    kind: "schools",
    schoolIds: ids,
  });
});

it("全局数据库版本推进后拒绝旧范围并异步清理主副键", async () => {
  const id = v7();
  const old = await revision();
  await scopes.write(id, "dept_and_below", old, {
    kind: "schools",
    schoolIds: Array.from({ length: 501 }, () => v7()),
  });
  await contexts.observeDatabaseRevision("13");
  expect(
    await scopes.contains(id, "dept_and_below", old, v7()),
  ).toBeUndefined();
  expect(
    await scopes.write(id, "dept_and_below", old, { kind: "all-schools" }),
  ).toBe(false);
  await expect
    .poll(() =>
      redis.exists(
        `scope:${id}:dept_and_below`,
        `scope:${id}:dept_and_below:schools`,
      ),
    )
    .toBe(0);
});
