import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identityVisibleSchema,
  scopePreviewRequestSchema,
  scopeSchoolsQuerySchema,
} from "../dist/index.js";
import {
  identityVisibleExample,
  scopePreviewExample,
  scopeSchoolListExample,
} from "../dist/scope-query-examples.js";

test("范围查询具有分页与逐动作默认值，拒绝未声明动作和组织权限", () => {
  assert.deepEqual(scopeSchoolsQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
    permission: "ops:school:view",
  });
  for (const permission of [
    "org:member:view",
    "school:student:unknown",
    "ops:school:fake",
    null,
    42,
  ])
    assert.equal(
      scopeSchoolsQuerySchema.safeParse({ permission }).success,
      false,
    );
  assert.equal(
    scopeSchoolsQuerySchema.safeParse({ permission: "school:student:update" })
      .success,
    true,
  );
  assert.equal(
    scopeSchoolsQuerySchema.safeParse({ pageSize: 101 }).success,
    false,
  );
});
test("范围预览区分选择草稿与身份配置，拒绝重复、非法角色及未知字段", () => {
  assert.equal(
    scopePreviewRequestSchema.safeParse({ mode: "selection", scopes: [] })
      .success,
    true,
  );
  assert.equal(
    scopePreviewRequestSchema.safeParse({
      mode: "identity",
      roleIds: [],
      departmentId: null,
      scopes: [],
    }).success,
    true,
  );
  const id = identityVisibleExample.identityId;
  for (const input of [
    {
      mode: "selection",
      scopes: [
        { type: "region", value: "330000" },
        { type: "region", value: "330000" },
      ],
    },
    {
      mode: "identity",
      roleIds: [id, id.toUpperCase()],
      departmentId: null,
      scopes: [],
    },
    { mode: "identity", roleIds: ["x"], departmentId: null, scopes: [] },
    { mode: "selection", scopes: [], dataScope: "all" },
  ])
    assert.equal(scopePreviewRequestSchema.safeParse(input).success, false);
});
test("学校列表和计算过程示例使用同一真实数量，缺少过程或行权限不可接受", () => {
  assert.equal(scopeSchoolListExample.total, scopePreviewExample.schoolCount);
  assert.equal(
    identityVisibleSchema.safeParse(identityVisibleExample).success,
    true,
  );
  assert.equal(
    identityVisibleSchema.safeParse({
      ...identityVisibleExample,
      steps: undefined,
    }).success,
    false,
  );
  assert.equal(
    identityVisibleSchema.safeParse({
      ...identityVisibleExample,
      items: [
        { ...identityVisibleExample.items[0], allowedActions: undefined },
      ],
    }).success,
    false,
  );
});
