import { z } from "zod";
import { identityTypeSchema } from "../identities.js";
import { type Action, actionSchema } from "../permissions.js";

const codePattern = /^[a-z][a-z0-9-]*$/;
const featureInputSchema = z.object({
  name: z.string().min(1),
  actions: z.array(actionSchema).min(1),
});
const menuInputSchema = z.object({
  key: z.string().regex(codePattern),
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  icon: z.string().regex(codePattern).optional(),
  feature: z.string().regex(codePattern),
  parentKey: z.string().regex(codePattern).optional(),
  client: z.enum(["admin", "mobile"]).default("admin"),
  sort: z.int().nonnegative(),
});
const appInputSchema = z.object({
  code: z.string().regex(codePattern),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().regex(codePattern),
  identityTypes: z.array(identityTypeSchema).min(1),
  sort: z.int().nonnegative(),
  features: z.record(z.string().regex(codePattern), featureInputSchema),
  menus: z.array(menuInputSchema),
});

export type FeatureInput = {
  name: string;
  actions: readonly Action[];
};

export type MenuInput<FeatureCode extends string> = {
  key: string;
  name: string;
  path: `/${string}`;
  icon?: string;
  feature: FeatureCode;
  parentKey?: string;
  client?: "admin" | "mobile";
  sort: number;
};

export type AppInput<
  Code extends string,
  Features extends Readonly<Record<string, FeatureInput>>,
> = {
  code: Code;
  name: string;
  description: string;
  icon: string;
  identityTypes: readonly z.infer<typeof identityTypeSchema>[];
  sort: number;
  features: Features;
  menus: readonly MenuInput<keyof Features & string>[];
};

function assertUnique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`${label}不能重复`);
}

/** 保留字面量类型，同时在模块加载时拒绝无效或相互矛盾的代码声明。 */
export function defineApp<
  const Code extends string,
  const Features extends Readonly<Record<string, FeatureInput>>,
>(input: AppInput<Code, Features>) {
  appInputSchema.parse(input);
  const featureCodes = new Set(Object.keys(input.features));
  for (const [featureCode, feature] of Object.entries(input.features))
    assertUnique(
      feature.actions,
      `功能模块 ${input.code}:${featureCode} 的动作`,
    );
  for (const menu of input.menus) {
    if (!featureCodes.has(menu.feature))
      throw new Error(`菜单 ${menu.key} 引用了未声明的功能模块`);
    if (
      menu.parentKey &&
      !input.menus.some(({ key }) => key === menu.parentKey)
    )
      throw new Error(`菜单 ${menu.key} 的父菜单不存在`);
  }
  assertUnique(input.identityTypes, `应用 ${input.code} 的可用身份`);
  assertUnique(
    input.menus.map(({ key }) => key),
    `应用 ${input.code} 的菜单 key`,
  );
  assertUnique(
    input.menus.map(({ path }) => path),
    `应用 ${input.code} 的菜单路径`,
  );
  return input;
}

export type AppDefinition = AppInput<
  string,
  Readonly<Record<string, FeatureInput>>
>;
