import assert from "node:assert/strict";
import test from "node:test";
import {
  appRegistry,
  availableModulesSchema,
  moduleDefinitions,
  moduleMenusQuerySchema,
  moduleMenusSchema,
  moduleNavigationExamples,
} from "../dist/index.js";

test("两个模块使用现有权限功能，菜单名、路径和分组符合新版规格", () => {
  assert.deepEqual(
    moduleDefinitions.map(({ code }) => code),
    ["base", "platform-admin"],
  );
  assert.deepEqual(moduleDefinitions[1].identityTypes, ["company"]);
  assert.equal(
    moduleDefinitions[0].groups.flatMap(({ menus }) => menus).length,
    11,
  );
  assert.equal(
    moduleDefinitions[1].groups.flatMap(({ menus }) => menus).length,
    11,
  );
  for (const module of moduleDefinitions) {
    for (const group of module.groups) {
      assert.equal(group.name.length, 4);
      for (const menu of group.menus) {
        assert.notEqual(menu.key, "workbench");
        for (const { app, feature } of menu.features) {
          assert.ok(
            appRegistry[app].features[feature].actions.includes("view"),
          );
        }
      }
    }
  }
});

test("模块查询拒绝旧应用参数、未知模块和混合参数", () => {
  assert.deepEqual(moduleMenusQuerySchema.parse({ module: "base" }), {
    module: "base",
  });
  for (const input of [
    { app: "school" },
    { module: "school" },
    { module: "base", app: "org" },
    {},
  ]) {
    assert.equal(moduleMenusQuerySchema.safeParse(input).success, false);
  }
});

test("模块响应示例有效，分组不可为空且模块必须有可见菜单", () => {
  assert.ok(
    availableModulesSchema.safeParse(moduleNavigationExamples.modules).success,
  );
  assert.ok(
    moduleMenusSchema.safeParse(moduleNavigationExamples.menus).success,
  );
  assert.equal(
    moduleMenusSchema.safeParse([
      { key: "school", name: "学校数据", sort: 0, children: [] },
    ]).success,
    false,
  );
  assert.equal(
    availableModulesSchema.safeParse([
      { ...moduleNavigationExamples.modules[0], menuCount: 0 },
    ]).success,
    false,
  );
});
