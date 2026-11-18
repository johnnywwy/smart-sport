import { z } from "zod";
import { appDefinitions } from "./apps/registry.js";
import {
  paginatedSchema,
  paginationQuerySchema,
  versionSchema,
} from "./common.js";
import { identityTypeSchema } from "./identities.js";
import { moduleCodeSchema, moduleDefinitions } from "./modules.js";

/** 管理目录与侧栏共用声明；聚合菜单的覆盖必须同时应用到所有底层菜单。 */
export const menuOverrideDefinitions = moduleDefinitions.flatMap((module) =>
  module.groups.flatMap((group, groupIndex) =>
    group.menus.map((menu, index) => ({
      module: module.code,
      moduleName: module.name,
      groupKey: group.key,
      groupName: group.name,
      groupSort: (groupIndex + 1) * 10,
      key: menu.key,
      name: menu.name,
      sort: (index + 1) * 10,
      identityTypes: module.identityTypes.filter((type) =>
        menu.features.some((ref) => {
          const app = appDefinitions.find((app) => app.code === ref.app);
          return app && (app.identityTypes as readonly string[]).includes(type);
        }),
      ),
      sources: menu.features.flatMap((ref) => {
        const app = appDefinitions.find((app) => app.code === ref.app);
        return (app?.menus ?? [])
          .filter(
            (source) =>
              source.feature === ref.feature &&
              (source.client ?? "admin") === "admin",
          )
          .map((source) => ({ app: ref.app, key: source.key }));
      }),
    })),
  ),
);
export const menuOverrideTargetSchema = z.strictObject({
  module: moduleCodeSchema,
  key: z.string().min(1).max(64),
});
export const menuOverrideFieldsSchema = z.strictObject({
  displayName: z.string().trim().min(1, "请填写显示名称").max(64),
  sort: z.int().min(0).max(1000000),
  hidden: z.boolean(),
  version: versionSchema,
});
export const menuOverrideChangeSchema = menuOverrideTargetSchema.extend(
  menuOverrideFieldsSchema.shape,
);
export const updateMenuOverridesSchema = z
  .strictObject({
    items: z.array(menuOverrideChangeSchema).min(1).max(100),
  })
  .superRefine(({ items }, ctx) => {
    const keys = new Set<string>();
    items.forEach((item, index) => {
      const key = `${item.module}:${item.key}`;
      if (keys.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "key"],
          message: "菜单不能重复",
        });
      keys.add(key);
    });
  });
export const menuOverrideQuerySchema = z.strictObject({
  ...paginationQuerySchema.shape,
  module: moduleCodeSchema,
  keyword: z.string().trim().max(100).optional(),
});
export const menuOverrideSchema = menuOverrideChangeSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  groupKey: z.string().min(1),
  groupName: z.string().min(1),
  groupSort: z.int().nonnegative(),
  identityTypes: z.array(identityTypeSchema),
  allowedActions: z.array(z.literal("update")),
});
export const menuOverrideListSchema = paginatedSchema(menuOverrideSchema);
export const menuOverridesSavedSchema = z.array(menuOverrideSchema);
export type MenuOverride = z.infer<typeof menuOverrideSchema>;
export type MenuOverrideQuery = z.infer<typeof menuOverrideQuerySchema>;
export type MenuOverrideChange = z.infer<typeof menuOverrideChangeSchema>;
export type MenuOverrideFields = z.infer<typeof menuOverrideFieldsSchema>;
export type UpdateMenuOverrides = z.infer<typeof updateMenuOverridesSchema>;
export const menuOverrideExamples = {
  update: updateMenuOverridesSchema.parse({
    items: [
      {
        module: "base",
        key: "departments",
        displayName: "组织架构",
        sort: 10,
        hidden: false,
        version: 1,
      },
    ],
  }),
  list: menuOverrideListSchema.parse({
    items: [
      {
        id: "base:departments",
        module: "base",
        key: "departments",
        name: "组织架构",
        displayName: "组织架构",
        sort: 10,
        hidden: false,
        version: 1,
        groupKey: "organization",
        groupName: "组织权限",
        groupSort: 10,
        identityTypes: ["company", "school"],
        allowedActions: ["update"],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  }),
};
