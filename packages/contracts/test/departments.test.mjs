import assert from "node:assert/strict";
import test from "node:test";
import { departmentTreeExample } from "../dist/department-examples.js";
import {
  createDepartmentSchema,
  deleteDepartmentSchema,
  departmentOrgQuerySchema,
  departmentTreeSchema,
  updateDepartmentSchema,
} from "../dist/index.js";

const id = "019c1472-9e57-7000-8000-000000000001";
test("部门创建不接收系统字段，名称去空白，上级可为根", () => {
  assert.deepEqual(
    createDepartmentSchema.parse({ name: " 研发组 ", parentId: null }),
    { name: "研发组", parentId: null },
  );
  for (const extra of [
    { code: "x" },
    { path: id },
    { orgId: id },
    { isPreset: true },
  ])
    assert.equal(
      createDepartmentSchema.safeParse({ name: "部门", ...extra }).success,
      false,
    );
  for (const name of [" ", "一".repeat(65)])
    assert.equal(createDepartmentSchema.safeParse({ name }).success, false);
});
test("修改删除必须有版本，修改支持显式移到根且不允许空操作", () => {
  assert.equal(
    updateDepartmentSchema.safeParse({ name: "新部门" }).success,
    false,
  );
  assert.equal(deleteDepartmentSchema.safeParse({}).success, false);
  assert.equal(updateDepartmentSchema.safeParse({ version: 0 }).success, false);
  assert.equal(
    updateDepartmentSchema.safeParse({ version: 0, sort: -1 }).success,
    false,
  );
  assert.deepEqual(
    updateDepartmentSchema.parse({ version: 0, parentId: null }),
    { version: 0, parentId: null },
  );
  assert.deepEqual(departmentOrgQuerySchema.parse({ orgId: id }), {
    orgId: id,
  });
  assert.equal(
    departmentOrgQuerySchema.safeParse({ unknown: 1 }).success,
    false,
  );
});
test("部门树示例包含逐层子部门、真实统计和行操作能力", () => {
  const tree = departmentTreeSchema.parse(departmentTreeExample);
  assert.equal(tree.items[0].children[0].memberCount, 1);
  assert.equal(tree.unassignedMemberCount, 1);
  assert.equal(tree.items[0].allowedActions.includes("delete"), false);
});

test("空部门树独立表达创建能力，旧响应保持兼容", () => {
  assert.deepEqual(
    departmentTreeSchema.parse({
      items: [],
      unassignedMemberCount: 0,
      allowedActions: ["create"],
    }).allowedActions,
    ["create"],
  );
  assert.deepEqual(
    departmentTreeSchema.parse({ items: [], unassignedMemberCount: 0 })
      .allowedActions,
    [],
  );
});
