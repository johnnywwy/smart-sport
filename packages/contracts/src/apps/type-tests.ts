import { defineApp } from "./define-app.js";
import type { DeclaredPermissionCode, FeatureCode } from "./registry.js";

const studentFeature: FeatureCode<"school"> = "student";
const studentView: DeclaredPermissionCode = "school:student:view";
void studentFeature;
void studentView;

function assertCompileTimeConstraints() {
  defineApp({
    code: "sample",
    name: "示例",
    description: "用于验证菜单与功能模块的类型约束",
    icon: "sample",
    identityTypes: ["company"],
    sort: 1,
    features: {
      valid: { name: "有效模块", actions: ["view"] },
    },
    menus: [
      {
        key: "invalid",
        name: "无效菜单",
        path: "/invalid",
        // @ts-expect-error 菜单只能引用当前应用声明的功能模块。
        feature: "missing",
        sort: 1,
      },
    ],
  });
  // @ts-expect-error 未声明的动作不能成为权限码。
  const undeclaredAction: DeclaredPermissionCode = "school:profile:delete";
  void undeclaredAction;
}
void assertCompileTimeConstraints;
