import assert from "node:assert/strict";
import test from "node:test";
import {
  appCodeSchema,
  appDefinitions,
  availableAppsSchema,
  currentMenusQuerySchema,
  currentMenusSchema,
  navigationExamples,
} from "../dist/index.js";

test("导航契约的应用枚举跟随已声明应用，拒绝未知应用与缺少参数", () => {
  assert.deepEqual(
    appCodeSchema.options,
    appDefinitions.map(({ code }) => code),
  );
  assert.equal(
    currentMenusQuerySchema.safeParse({ app: "unknown" }).success,
    false,
  );
  assert.equal(currentMenusQuerySchema.safeParse({}).success, false);
});
test("导航示例与空权限结果可解析，菜单支持嵌套子节点", () => {
  assert.deepEqual(
    availableAppsSchema.parse(navigationExamples.apps),
    navigationExamples.apps,
  );
  assert.deepEqual(currentMenusSchema.parse([]), []);
  const parent = navigationExamples.menus[0];
  const nested = [{ ...parent, children: [{ ...parent, key: "child" }] }];
  assert.deepEqual(currentMenusSchema.parse(nested), nested);
  assert.equal(
    currentMenusSchema.safeParse([{ ...parent, children: [{ key: "broken" }] }])
      .success,
    false,
  );
});
