import assert from "node:assert/strict";
import { test } from "node:test";
import {
  menuOverrideDefinitions,
  menuOverrideExamples,
  menuOverrideFieldsSchema,
  updateMenuOverridesSchema,
} from "../dist/index.js";

test("菜单管理目录与聚合功能声明一致，不包含固定工作台", () => {
  assert.equal(menuOverrideDefinitions.length, 23);
  assert.ok(
    menuOverrideDefinitions.every(
      (row) => row.key !== "workbench" && row.sources.length > 0,
    ),
  );
  assert.equal(
    new Set(
      menuOverrideDefinitions.flatMap((row) =>
        row.sources.map((s) => `${s.app}:${s.key}`),
      ),
    ).size,
    menuOverrideDefinitions.flatMap((row) => row.sources).length,
  );
  assert.equal(
    menuOverrideDefinitions.find((r) => r.key === "classes").sources.length,
    2,
  );
  assert.ok(menuOverrideDefinitions.find((r) => r.key === "colleges"));
});
test("菜单覆盖批量保存校验名称、顺序、版本及重复菜单，不接受修改图标权限和分组", () => {
  const row = menuOverrideExamples.update.items[0];
  assert.ok(
    updateMenuOverridesSchema.safeParse(menuOverrideExamples.update).success,
  );
  for (const change of [
    { displayName: " " },
    { sort: -1 },
    { sort: 1.5 },
    { sort: 1000001 },
    { version: -1 },
    { hidden: 1 },
    { icon: "x" },
    { groupKey: "x" },
    { permissions: [] },
  ])
    assert.equal(
      updateMenuOverridesSchema.safeParse({ items: [{ ...row, ...change }] })
        .success,
      false,
    );
  assert.equal(
    updateMenuOverridesSchema.safeParse({ items: [row, row] }).success,
    false,
  );
  assert.equal(
    updateMenuOverridesSchema.safeParse({ items: [] }).success,
    false,
  );
  assert.equal(
    menuOverrideFieldsSchema.parse({
      displayName: " 新名称 ",
      sort: 0,
      hidden: false,
      version: 1,
    }).displayName,
    "新名称",
  );
});
