import assert from "node:assert/strict";
import test from "node:test";
import {
  appDefinitions,
  createRoleSchema,
  resetRoleSchema,
  roleListQuerySchema,
  saveRoleGrantsSchema,
} from "../dist/index.js";

const baseRoleId = "019c1472-9e57-7000-8000-000000000001";
const grants = appDefinitions.flatMap((app) =>
  Object.keys(app.features).map((feature) => ({
    app: app.code,
    feature,
    grant: { level: "none" },
  })),
);
test("自定义角色创建只接收名称、基础角色与范围，编码和组织由服务端决定", () => {
  const input = { name: " 年级负责人 ", baseRoleId, dataScope: "dept" };
  assert.equal(createRoleSchema.parse(input).name, "年级负责人");
  for (const extra of [
    { code: "custom" },
    { orgId: baseRoleId },
    { kind: "preset" },
  ])
    assert.equal(
      createRoleSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
  assert.equal(
    createRoleSchema.safeParse({ ...input, name: " " }).success,
    false,
  );
});
test("角色档位整体提交，不允许遗漏功能、重复功能或未声明动作", () => {
  const body = { version: 0, dataScope: "personal", grants };
  assert.equal(saveRoleGrantsSchema.parse(body).version, 0);
  for (const invalid of [
    grants.slice(1),
    [...grants, grants[0]],
    grants.map((g, i) =>
      i
        ? g
        : {
            ...g,
            grant: { level: "custom", actions: ["unknown"] },
          },
    ),
  ])
    assert.equal(
      saveRoleGrantsSchema.safeParse({ ...body, grants: invalid }).success,
      false,
    );
});
test("角色查询不能指定其他组织，恢复必须带资源版本", () => {
  assert.deepEqual(roleListQuerySchema.parse({ identityType: "teacher" }), {
    identityType: "teacher",
  });
  assert.equal(
    roleListQuerySchema.safeParse({ orgId: baseRoleId }).success,
    false,
  );
  assert.equal(resetRoleSchema.safeParse({}).success, false);
  assert.deepEqual(resetRoleSchema.parse({ version: 0 }), { version: 0 });
});
