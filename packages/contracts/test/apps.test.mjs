import assert from "node:assert/strict";
import test from "node:test";
import {
  agentDelegablePermissions,
  appDefinitions,
  appRegistry,
  permissionErrors,
  presetRoles,
} from "../dist/index.js";

test("声明 M1 五个应用与全部功能模块", () => {
  assert.deepEqual(Object.keys(appRegistry), [
    "system",
    "platform",
    "org",
    "ops",
    "school",
  ]);
  assert.equal(appDefinitions.length, 5);
  assert.equal(
    appDefinitions.reduce(
      (count, app) => count + Object.keys(app.features).length,
      0,
    ),
    26,
  );
});

test("每个菜单引用本应用功能模块且 key 与路径唯一", () => {
  for (const app of appDefinitions) {
    const featureCodes = new Set(Object.keys(app.features));
    assert.equal(
      new Set(app.menus.map(({ key }) => key)).size,
      app.menus.length,
    );
    assert.equal(
      new Set(app.menus.map(({ path }) => path)).size,
      app.menus.length,
    );
    for (const menu of app.menus) assert(featureCodes.has(menu.feature));
  }
});

test("敏感与审核动作只出现在规格指定模块", () => {
  const specialActions = appDefinitions.flatMap((app) =>
    Object.entries(app.features).flatMap(([feature, definition]) =>
      definition.actions
        .filter((action) => action === "approve" || action === "sensitive")
        .map((action) => `${app.code}:${feature}:${action}`),
    ),
  );
  assert.deepEqual(specialActions, [
    "platform:subscription:approve",
    "school:student:sensitive",
    "school:teacher:sensitive",
    "school:transfer:approve",
  ]);
});

test("代理商授权上限只包含四类学校数据的常用动作", () => {
  assert.equal(agentDelegablePermissions.length, 20);
  assert(agentDelegablePermissions.every((code) => code.startsWith("school:")));
  assert(!agentDelegablePermissions.some((code) => code.endsWith(":delete")));
  assert(
    !agentDelegablePermissions.some((code) => code.endsWith(":sensitive")),
  );
});

test("声明全部内置角色且授权引用有效模块", () => {
  assert.equal(presetRoles.length, 16);
  assert.equal(new Set(presetRoles.map(({ code }) => code)).size, 16);
  for (const role of presetRoles) {
    for (const [appCode, grants] of Object.entries(role.grants)) {
      assert(appCode in appRegistry);
      for (const featureCode of Object.keys(grants))
        assert(featureCode in appRegistry[appCode].features);
    }
  }
});

test("权限错误码完整进入统一错误表", () => {
  assert.deepEqual(
    Object.keys(permissionErrors).map(Number),
    [11101, 11102, 11103, 11104, 11105, 11106],
  );
});
