import { z } from "zod";
import { appDefinitions } from "./apps/registry.js";

export const appCodeSchema = z.enum(appDefinitions.map(({ code }) => code));
export const availableAppSchema = z.object({
  code: appCodeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  sort: z.int().nonnegative(),
});
export const availableAppsSchema = z.array(availableAppSchema);
export const currentMenusQuerySchema = z.object({ app: appCodeSchema });
export const menuNodeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  icon: z.string().min(1).nullable(),
  sort: z.int().nonnegative(),
  get children() {
    return z.array(menuNodeSchema);
  },
});
export const currentMenusSchema = z.array(menuNodeSchema);

export type AvailableApp = z.infer<typeof availableAppSchema>;
export type CurrentMenusQuery = z.infer<typeof currentMenusQuerySchema>;
export type MenuNode = z.infer<typeof menuNodeSchema>;

export const navigationExamples = {
  apps: availableAppsSchema.parse([
    {
      code: "ops",
      name: "学校运营",
      description: "查看负责范围内的学校",
      icon: "school",
      sort: 40,
    },
  ]),
  menus: currentMenusSchema.parse([
    {
      key: "school",
      name: "学校列表",
      path: "/schools",
      icon: "school",
      sort: 10,
      children: [],
    },
  ]),
} as const;
