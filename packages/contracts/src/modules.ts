import { z } from "zod";
import {
  type AppCode,
  appRegistry,
  type FeatureCode,
} from "./apps/registry.js";
import type { IdentityType } from "./identities.js";

/** 导航模块引用既有功能，应用权限命名空间保持不变。 */
export type ModuleFeature = {
  [A in AppCode]: { app: A; feature: FeatureCode<A> };
}[AppCode];
export type ModuleMenuDefinition = {
  key: string;
  name: string;
  path: `/${string}`;
  icon: string;
  features: readonly ModuleFeature[];
};
type ModuleGroupDefinition = {
  key: string;
  name: string;
  menus: readonly ModuleMenuDefinition[];
};
type ModuleDefinition = {
  code: string;
  name: string;
  description: string;
  icon: string;
  sort: number;
  identityTypes: readonly IdentityType[];
  groups: readonly ModuleGroupDefinition[];
};

export const moduleDefinitions = [
  {
    code: "base",
    name: "基础信息",
    description: "组织、人员、学校、班级和学生",
    icon: "school",
    sort: 10,
    identityTypes: ["company", "bureau", "agent", "school", "teacher"],
    groups: [
      {
        key: "organization",
        name: "组织权限",
        menus: [
          {
            key: "departments",
            name: "组织架构",
            path: "/departments",
            icon: "git-branch",
            features: [{ app: "org", feature: "department" }],
          },
          {
            key: "members",
            name: "成员账号",
            path: "/members",
            icon: "users",
            features: [{ app: "org", feature: "member" }],
          },
          {
            key: "roles",
            name: "角色权限",
            path: "/roles",
            icon: "shield",
            features: [{ app: "org", feature: "role" }],
          },
        ],
      },
      {
        key: "school",
        name: "学校数据",
        menus: [
          {
            key: "schools",
            name: "学校管理",
            path: "/schools",
            icon: "school",
            features: [
              { app: "ops", feature: "school" },
              { app: "school", feature: "profile" },
            ],
          },
          {
            key: "classes",
            name: "班级管理",
            path: "/classes",
            icon: "users",
            features: [
              { app: "school", feature: "class" },
              { app: "school", feature: "teaching-class" },
              { app: "school", feature: "college" },
            ],
          },
          {
            key: "students",
            name: "学生管理",
            path: "/students",
            icon: "user",
            features: [{ app: "school", feature: "student" }],
          },
          {
            key: "teachers",
            name: "教师管理",
            path: "/teachers",
            icon: "user-check",
            features: [{ app: "school", feature: "teacher" }],
          },
        ],
      },
      {
        key: "enrollment",
        name: "学籍变动",
        menus: [
          {
            key: "rollover",
            name: "学年升级",
            path: "/rollover",
            icon: "refresh",
            features: [{ app: "school", feature: "rollover" }],
          },
          {
            key: "transfers",
            name: "转学管理",
            path: "/transfers",
            icon: "arrow-right-left",
            features: [{ app: "school", feature: "transfer" }],
          },
        ],
      },
      {
        key: "records",
        name: "授权记录",
        menus: [
          {
            key: "agent-grants",
            name: "代理商授权",
            path: "/agent-grants",
            icon: "handshake",
            features: [{ app: "school", feature: "agent-grant" }],
          },
          {
            key: "audits",
            name: "操作记录",
            path: "/audits",
            icon: "history",
            features: [{ app: "org", feature: "audit" }],
          },
        ],
      },
    ],
  },
  {
    code: "platform-admin",
    name: "平台管理",
    description: "开通学校、管理机构和全平台设置",
    icon: "settings",
    sort: 20,
    identityTypes: ["company"],
    groups: [
      {
        key: "institutions",
        name: "机构学校",
        menus: [
          {
            key: "organizations",
            name: "机构管理",
            path: "/organizations",
            icon: "building",
            features: [{ app: "platform", feature: "org" }],
          },
          {
            key: "onboarding",
            name: "学校开通",
            path: "/school-onboarding",
            icon: "school",
            features: [{ app: "platform", feature: "onboarding" }],
          },
          {
            key: "subscriptions",
            name: "服务模块",
            path: "/subscriptions",
            icon: "package",
            features: [{ app: "platform", feature: "subscription" }],
          },
        ],
      },
      {
        key: "permissions",
        name: "权限设置",
        menus: [
          {
            key: "preset-roles",
            name: "角色模板",
            path: "/preset-roles",
            icon: "shield",
            features: [{ app: "system", feature: "preset-role" }],
          },
          {
            key: "menus",
            name: "菜单设置",
            path: "/menu-overrides",
            icon: "menu",
            features: [{ app: "system", feature: "menu" }],
          },
        ],
      },
      {
        key: "settings",
        name: "基础设置",
        menus: [
          {
            key: "academic",
            name: "学年学期",
            path: "/academic-years",
            icon: "calendar",
            features: [{ app: "system", feature: "academic" }],
          },
          {
            key: "dictionaries",
            name: "数据字典",
            path: "/dictionaries",
            icon: "book-open",
            features: [{ app: "system", feature: "dict" }],
          },
          {
            key: "parameters",
            name: "系统参数",
            path: "/parameters",
            icon: "sliders",
            features: [{ app: "system", feature: "param" }],
          },
          {
            key: "number-rules",
            name: "编号规则",
            path: "/number-rules",
            icon: "hash",
            features: [{ app: "system", feature: "number" }],
          },
          {
            key: "regions",
            name: "行政区划",
            path: "/regions",
            icon: "map",
            features: [{ app: "system", feature: "region" }],
          },
        ],
      },
      {
        key: "records",
        name: "平台记录",
        menus: [
          {
            key: "audits",
            name: "平台操作记录",
            path: "/audits",
            icon: "history",
            features: [{ app: "system", feature: "audit" }],
          },
        ],
      },
    ],
  },
] as const satisfies readonly ModuleDefinition[];

// 除类型检查外，模块加载时也验证路径和引用，保护同步脚本等 JS 调用方。
for (const module of moduleDefinitions) {
  const keys = new Set<string>();
  const paths = new Set<string>();
  for (const group of module.groups) {
    if (group.name.length !== 4) throw new Error("导航分组名称必须为四个字");
    for (const menu of group.menus) {
      if (keys.has(menu.key) || paths.has(menu.path))
        throw new Error("模块菜单不能重复");
      keys.add(menu.key);
      paths.add(menu.path);
      for (const ref of menu.features) {
        const app = appRegistry[ref.app];
        if (!(ref.feature in app.features))
          throw new Error("导航引用了未声明的功能");
      }
    }
  }
}

export const moduleCodeSchema = z.enum(
  moduleDefinitions.map(({ code }) => code),
);
export const moduleMenusQuerySchema = z.strictObject({
  module: moduleCodeSchema,
});
export const moduleMenuSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  icon: z.string().nullable(),
  sort: z.int().nonnegative(),
});
export const moduleMenuGroupSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  sort: z.int().nonnegative(),
  children: z.array(moduleMenuSchema).min(1),
});
export const moduleMenusSchema = z.array(moduleMenuGroupSchema);
export const availableModuleSchema = z.object({
  code: moduleCodeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  sort: z.int().nonnegative(),
  menuPreview: z.array(z.string().min(1)),
  menuCount: z.int().positive(),
});
export const availableModulesSchema = z.array(availableModuleSchema);
export type ModuleCode = z.infer<typeof moduleCodeSchema>;
export type ModuleMenusQuery = z.infer<typeof moduleMenusQuerySchema>;
export type ModuleMenu = z.infer<typeof moduleMenuSchema>;
export type ModuleMenuGroup = z.infer<typeof moduleMenuGroupSchema>;
export type AvailableModule = z.infer<typeof availableModuleSchema>;
export const moduleNavigationExamples = {
  modules: availableModulesSchema.parse([
    {
      code: "base",
      name: "基础信息",
      description: "组织、人员、学校、班级和学生",
      icon: "school",
      sort: 10,
      menuPreview: ["学生管理"],
      menuCount: 1,
    },
  ]),
  menus: moduleMenusSchema.parse([
    {
      key: "school",
      name: "学校数据",
      sort: 20,
      children: [
        {
          key: "students",
          name: "学生管理",
          path: "/students",
          icon: "user",
          sort: 30,
        },
      ],
    },
  ]),
};

/** 迁移期同一路径接受两种查询；必须且只能指定其中一种。 */
export const navigationMenusQuerySchema = z
  .strictObject({
    module: moduleCodeSchema.optional(),
    app: z.enum(Object.keys(appRegistry) as [AppCode, ...AppCode[]]).optional(),
  })
  .refine(({ module, app }) => Boolean(module) !== Boolean(app), {
    message: "必须且只能指定 module 或 app",
  });

export type NavigationMenusQuery = z.infer<typeof navigationMenusQuerySchema>;
