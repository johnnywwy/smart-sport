import assert from "node:assert/strict";
import test from "node:test";
import {
  departmentScopesExample,
  scopeOptionsExample,
  setDepartmentScopesExample,
} from "../dist/department-scope-examples.js";
import {
  departmentScopesSchema,
  scopeOptionsQuerySchema,
  scopeOptionsSchema,
  setDepartmentScopesSchema,
} from "../dist/index.js";

test("部门范围使用部门版本整体替换，允许清空，禁止客户端指定组织、人数和权限", () => {
  assert.deepEqual(
    setDepartmentScopesSchema.parse({ version: 0, scopes: [] }),
    { version: 0, scopes: [] },
  );
  for (const input of [
    { scopes: [] },
    { version: -1, scopes: [] },
    { version: 0, scopes: [], orgId: departmentScopesExample.departmentId },
    { version: 0, scopes: [], schoolCount: 999 },
    { version: 0, scopes: [], allowedActions: ["update"] },
    { version: 0, scopes: [{ type: "school", value: "unknown" }] },
    {
      version: 0,
      scopes: [
        { type: "region", value: "330000" },
        { type: "region", value: "330000" },
      ],
    },
  ])
    assert.equal(setDepartmentScopesSchema.safeParse(input).success, false);
});
test("可选范围提供分页和区划上级，学校选项不能混入上级或未知查询条件", () => {
  assert.deepEqual(scopeOptionsQuerySchema.parse({ type: "school" }), {
    type: "school",
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    scopeOptionsQuerySchema.parse({
      type: "region",
      parent: "330000",
      page: "2",
      pageSize: "10",
    }).page,
    2,
  );
  for (const query of [
    {},
    { type: "class" },
    { type: "school", parent: "330000" },
    { type: "region", parent: "330" },
    { type: "school", pageSize: 101 },
    { type: "school", permissions: [] },
  ])
    assert.equal(scopeOptionsQuerySchema.safeParse(query).success, false);
});
test("范围选项严格区分值的格式，并能表达已失效但仍保留的选择", () => {
  const original = departmentScopesExample;
  const unavailable = {
    ...original,
    scopes: [
      {
        type: "school",
        value: original.departmentId,
        name: "已失效的负责范围",
        available: false,
        parentValue: null,
      },
    ],
  };
  assert.equal(
    departmentScopesSchema.parse(unavailable).scopes[0].available,
    false,
  );
  for (const type of ["school", "region", "grade", "college"])
    assert.equal(
      departmentScopesSchema.safeParse({
        ...original,
        scopes: [
          {
            type,
            value: "unknown",
            name: "范围",
            available: true,
            parentValue: null,
          },
        ],
      }).success,
      false,
    );
});
test("请求、部门范围和分页选项示例符合共享契约", () => {
  assert.deepEqual(
    setDepartmentScopesSchema.parse(setDepartmentScopesExample),
    setDepartmentScopesExample,
  );
  assert.deepEqual(
    departmentScopesSchema.parse(departmentScopesExample),
    departmentScopesExample,
  );
  assert.deepEqual(
    scopeOptionsSchema.parse(scopeOptionsExample),
    scopeOptionsExample,
  );
});
