import { z } from "zod";
import { identityTypeSchema } from "../identities.js";
import {
  dataScopeSchema,
  type FeatureGrant,
  grantSchema,
} from "../permissions.js";
import { type AppCode, appRegistry, type FeatureCode } from "./registry.js";

type RoleGrantInput = {
  [A in AppCode]?: Partial<Record<FeatureCode<A>, FeatureGrant>>;
};

export type PresetRoleInput = {
  code: string;
  name: string;
  identityType: z.infer<typeof identityTypeSchema>;
  dataScope: z.infer<typeof dataScopeSchema>;
  defaultDepartment?: string;
  grants: RoleGrantInput;
};

const roleInputSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  identityType: identityTypeSchema,
  dataScope: dataScopeSchema,
  defaultDepartment: z.string().min(1).optional(),
  grants: z.record(z.string(), z.record(z.string(), grantSchema)),
});

function definePresetRole<const Role extends PresetRoleInput>(role: Role) {
  roleInputSchema.parse(role);
  for (const [appCode, features] of Object.entries(role.grants)) {
    const app = appRegistry[appCode as AppCode];
    if (!app) throw new Error(`内置角色 ${role.code} 引用了未知应用`);
    for (const featureCode of Object.keys(features ?? {})) {
      if (!(featureCode in app.features))
        throw new Error(`内置角色 ${role.code} 引用了未知功能模块`);
    }
  }
  return role;
}

const allFeatures = <A extends AppCode>(
  appCode: A,
  level: FeatureGrant["level"],
) =>
  Object.fromEntries(
    Object.keys(appRegistry[appCode].features).map((feature) => [
      feature,
      { level },
    ]),
  ) as Record<FeatureCode<A>, FeatureGrant>;

export const presetRoles = [
  definePresetRole({
    code: "company-super-admin",
    name: "超级管理员",
    identityType: "company",
    dataScope: "all",
    grants: {
      system: allFeatures("system", "manage"),
      platform: allFeatures("platform", "manage"),
      org: allFeatures("org", "manage"),
      ops: allFeatures("ops", "manage"),
      school: allFeatures("school", "manage"),
    },
  }),
  definePresetRole({
    code: "company-developer",
    name: "研发人员",
    identityType: "company",
    dataScope: "all",
    defaultDepartment: "研发部",
    grants: {
      system: {
        ...allFeatures("system", "manage"),
        "preset-role": { level: "view" },
      },
      platform: allFeatures("platform", "view"),
      ops: allFeatures("ops", "view"),
      school: allFeatures("school", "view"),
    },
  }),
  definePresetRole({
    code: "company-sales",
    name: "销售",
    identityType: "company",
    dataScope: "dept_and_below",
    defaultDepartment: "销售部",
    grants: {
      platform: { subscription: { level: "edit" } },
      ops: allFeatures("ops", "view"),
    },
  }),
  definePresetRole({
    code: "company-support",
    name: "技术服务",
    identityType: "company",
    dataScope: "dept_and_below",
    defaultDepartment: "技术服务部",
    grants: {
      ops: allFeatures("ops", "view"),
      school: allFeatures("school", "edit"),
    },
  }),
  definePresetRole({
    code: "company-production",
    name: "生产",
    identityType: "company",
    dataScope: "dept_and_below",
    defaultDepartment: "生产部",
    grants: { ops: allFeatures("ops", "view") },
  }),
  definePresetRole({
    code: "company-readonly-auditor",
    name: "只读审计",
    identityType: "company",
    dataScope: "all",
    grants: {
      system: allFeatures("system", "view"),
      platform: allFeatures("platform", "view"),
      org: allFeatures("org", "view"),
      ops: allFeatures("ops", "view"),
      school: allFeatures("school", "view"),
    },
  }),
  definePresetRole({
    code: "bureau-admin",
    name: "局管理员",
    identityType: "bureau",
    dataScope: "all",
    grants: {
      org: allFeatures("org", "manage"),
      ops: allFeatures("ops", "view"),
    },
  }),
  definePresetRole({
    code: "bureau-officer",
    name: "业务科员",
    identityType: "bureau",
    dataScope: "all",
    grants: { ops: allFeatures("ops", "view") },
  }),
  definePresetRole({
    code: "bureau-leader-viewer",
    name: "领导查看",
    identityType: "bureau",
    dataScope: "all",
    grants: { ops: allFeatures("ops", "view") },
  }),
  definePresetRole({
    code: "agent-admin",
    name: "代理商管理员",
    identityType: "agent",
    dataScope: "all",
    grants: {
      org: allFeatures("org", "manage"),
      ops: allFeatures("ops", "view"),
      school: allFeatures("school", "edit"),
    },
  }),
  definePresetRole({
    code: "agent-operator",
    name: "代理商运营",
    identityType: "agent",
    dataScope: "all",
    grants: {
      ops: allFeatures("ops", "view"),
      school: {
        class: { level: "edit" },
        student: { level: "edit" },
      },
    },
  }),
  definePresetRole({
    code: "school-admin",
    name: "学校管理员",
    identityType: "school",
    dataScope: "all",
    grants: {
      org: allFeatures("org", "manage"),
      school: allFeatures("school", "manage"),
    },
  }),
  definePresetRole({
    code: "school-pe-leader",
    name: "体育组长",
    identityType: "school",
    dataScope: "all",
    grants: {
      school: {
        class: { level: "edit" },
        "teaching-class": { level: "edit" },
        college: { level: "edit" },
        student: { level: "edit" },
        teacher: { level: "edit" },
        rollover: { level: "edit" },
        transfer: { level: "edit" },
      },
    },
  }),
  definePresetRole({
    code: "teacher-pe",
    name: "体育教师",
    identityType: "teacher",
    dataScope: "personal",
    grants: {
      school: {
        class: { level: "view" },
        "teaching-class": { level: "view" },
        student: { level: "view" },
      },
    },
  }),
  definePresetRole({
    code: "teacher-head",
    name: "班主任",
    identityType: "teacher",
    dataScope: "personal",
    grants: { school: { student: { level: "edit" } } },
  }),
  definePresetRole({
    code: "teacher-grade-leader",
    name: "年级组长",
    identityType: "teacher",
    dataScope: "dept",
    grants: {
      school: {
        class: { level: "view" },
        student: { level: "view" },
      },
    },
  }),
] as const;

export type PresetRoleCode = (typeof presetRoles)[number]["code"];
