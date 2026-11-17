import assert from "node:assert/strict";
import test from "node:test";
import { dictItemExample } from "../dist/dict-examples.js";
import {
  apiErrors,
  createDictItemSchema,
  deleteDictItemSchema,
  dictDefinitions,
  dictItemListSchema,
  dictItemParamsSchema,
  dictItemQuerySchema,
  dictTypeParamsSchema,
  identityTypeSchema,
  organizationTypeSchema,
  updateDictItemSchema,
} from "../dist/index.js";

test("七类字典值唯一，民族完整，年级编码及身份组织与现有契约一致", () => {
  assert.equal(dictDefinitions.length, 7);
  for (const d of dictDefinitions) {
    assert.equal(new Set(d.items.map((i) => i.value)).size, d.items.length);
    assert.equal(new Set(d.items.map((i) => i.label)).size, d.items.length);
  }
  const find = (code) => dictDefinitions.find((d) => d.code === code);
  assert.equal(find("ethnicity").items.length, 56);
  assert.deepEqual(find("ethnicity").items[31], {
    value: "32",
    label: "仫佬族",
  });
  assert.equal(find("ethnicity").items.at(-1).value, "56");
  assert.equal(find("grade").items.length, 18);
  assert.ok(
    find("grade").items.some((i) => i.value === "24" && i.label === "初四"),
  );
  assert.deepEqual(
    find("identity_type").items.map((i) => i.value),
    identityTypeSchema.options,
  );
  assert.deepEqual(
    find("organization_type").items.map((i) => i.value),
    organizationTypeSchema.options,
  );
  assert.deepEqual(
    dictDefinitions.filter((d) => d.allowCustom).map((d) => d.code),
    ["document_type"],
  );
});
test("新增不接受技术值、来源、使用标记；更新删除必须携带版本", () => {
  const valid = {
    label: "港澳居民居住证",
    description: "",
    sort: 5,
    enabled: true,
  };
  assert.deepEqual(createDictItemSchema.parse(valid), valid);
  assert.equal(createDictItemSchema.parse({ label: "测试" }).enabled, true);
  for (const payload of [
    { ...valid, value: "admin" },
    { ...valid, isSystem: false },
    { ...valid, used: false },
    { ...valid, typeCode: "gender" },
    { ...valid, label: "  " },
    { ...valid, sort: -1 },
    { ...valid, sort: 1.5 },
    { ...valid, sort: 1000000 },
    { ...valid, enabled: 1 },
  ])
    assert.equal(createDictItemSchema.safeParse(payload).success, false);
  assert.ok(updateDictItemSchema.safeParse({ ...valid, version: 0 }).success);
  assert.equal(updateDictItemSchema.safeParse(valid).success, false);
  assert.equal(deleteDictItemSchema.safeParse({ version: -1 }).success, false);
  assert.equal(deleteDictItemSchema.safeParse({}).success, false);
});
test("严格路由、分页筛选和响应示例，错误码已声明", () => {
  assert.ok(dictTypeParamsSchema.safeParse({ typeCode: "stage" }).success);
  assert.equal(
    dictTypeParamsSchema.safeParse({ typeCode: "anything" }).success,
    false,
  );
  assert.ok(dictItemParamsSchema.safeParse({ id: dictItemExample.id }).success);
  assert.equal(dictItemParamsSchema.safeParse({ id: "x" }).success, false);
  assert.equal(dictItemQuerySchema.parse({ enabled: "false" }).enabled, false);
  assert.equal(dictItemQuerySchema.safeParse({ enabled: "0" }).success, false);
  assert.equal(
    dictItemQuerySchema.safeParse({ sort: "value:asc" }).success,
    false,
  );
  assert.equal(dictItemQuerySchema.safeParse({ schoolId: "x" }).success, false);
  assert.ok(
    dictItemListSchema.safeParse({
      items: [dictItemExample],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  );
  for (const code of [30010, 30011, 30012, 30013, 30014])
    assert.ok(apiErrors[code]);
});
