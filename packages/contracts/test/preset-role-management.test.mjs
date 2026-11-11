import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appDefinitions,
  presetRoles,
  savePresetRoleSchema,
} from "../dist/index.js";

const grants = appDefinitions.flatMap((app) =>
  Object.keys(app.features).map((feature) => ({
    app: app.code,
    feature,
    grant: { level: "none" },
  })),
);
const example = { version: 0, dataScope: "all", remark: null, grants };
test("模板整体提交校验完整功能集合", () => {
  assert.equal(savePresetRoleSchema.safeParse(example).success, true);
  assert.equal(
    savePresetRoleSchema.safeParse({ ...example, grants: grants.slice(1) })
      .success,
    false,
  );
  assert.equal(
    savePresetRoleSchema.safeParse({
      ...example,
      grants: [...grants, grants[0]],
    }).success,
    false,
  );
});
test("拒绝不存在的功能与非法细调动作", () => {
  assert.equal(
    savePresetRoleSchema.safeParse({
      ...example,
      grants: grants.map((g, i) => (i ? g : { ...g, feature: "unknown" })),
    }).success,
    false,
  );
  assert.equal(
    savePresetRoleSchema.safeParse({
      ...example,
      grants: grants.map((g) =>
        g.app === "system" && g.feature === "param"
          ? { ...g, grant: { level: "custom", actions: ["delete"] } }
          : g,
      ),
    }).success,
    false,
  );
});
test("默认只有超管可修改内置角色模板", () => {
  const superAdmin = presetRoles.find((r) => r.code === "company-super-admin");
  const developer = presetRoles.find((r) => r.code === "company-developer");
  assert.equal(superAdmin.grants.system["preset-role"].level, "manage");
  assert.equal(developer.grants.system["preset-role"].level, "view");
});
