import assert from "node:assert/strict";
import test from "node:test";
import {
  identityScopesExample,
  setIdentityScopesExample,
} from "../dist/identity-scope-examples.js";
import {
  apiErrors,
  extraScopeSchema,
  identityScopesSchema,
  setIdentityScopesSchema,
} from "../dist/index.js";

const id = "019c1472-9e57-7000-8000-000000000001";
test("本人范围整体替换使用身份版本，允许清空，拒绝客户端组织与权限字段", () => {
  assert.deepEqual(setIdentityScopesSchema.parse({ version: 0, scopes: [] }), {
    version: 0,
    scopes: [],
  });
  for (const input of [
    { scopes: [] },
    { version: -1, scopes: [] },
    { version: 0, scopes: [], orgId: id },
    { version: 0, scopes: [], identityId: id },
    { version: 0, scopes: [], permissions: [] },
  ])
    assert.equal(setIdentityScopesSchema.safeParse(input).success, false);
});
test("范围格式区分学校、区划、年级、学院，不接受额外班级类型或畸形值", () => {
  for (const input of [
    { type: "school", value: id },
    { type: "college", value: id },
    { type: "region", value: "330106" },
    ...["11", "16", "21", "24", "31", "33", "41", "45"].map((value) => ({
      type: "grade",
      value,
    })),
  ])
    assert.equal(extraScopeSchema.safeParse(input).success, true);
  for (const input of [
    { type: "class", value: id },
    { type: "school", value: "unknown" },
    { type: "college", value: "unknown" },
    { type: "region", value: "330000.330100" },
    { type: "region", value: "33000" },
    ...["10", "17", "25", "34", "46", "011", " 11"].map((value) => ({
      type: "grade",
      value,
    })),
  ])
    assert.equal(extraScopeSchema.safeParse(input).success, false);
});
test("拒绝重复范围并返回对应条目的错误位置", () => {
  const result = setIdentityScopesSchema.safeParse({
    version: 0,
    scopes: [
      { type: "region", value: "330000" },
      { type: "region", value: "330000" },
    ],
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues[0].path, ["scopes", 1, "value"]);
});
test("范围示例可通过共享契约，不以格式合法代表外边界校验通过", () => {
  assert.deepEqual(
    setIdentityScopesSchema.parse(setIdentityScopesExample),
    setIdentityScopesExample,
  );
  assert.deepEqual(
    identityScopesSchema.parse(identityScopesExample),
    identityScopesExample,
  );
});

test("不可用的范围类型有明确的业务错误，隐藏范围值沿用404", () => {
  assert.equal(apiErrors[12004].status, 422);
  assert.equal(apiErrors[90004].status, 404);
});
