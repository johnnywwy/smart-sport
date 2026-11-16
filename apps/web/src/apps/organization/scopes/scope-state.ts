import {
  appDefinitions,
  type ScopeOption,
  scopeOptionSchema,
  scopePermissionSchema,
  setIdentityScopesSchema,
} from "@smart-sport/contracts";
export type ScopeTarget = {
  kind: "department" | "identity";
  id: string;
  name: string;
};
export const scopeTargetKey = (identityId: string, target: ScopeTarget) =>
  [identityId, "scope-details", target.kind, target.id] as const;
export const scopeDetailsPath = (target: ScopeTarget) =>
  `/api/v1/${target.kind === "department" ? "departments" : "identities"}/${target.id}/scopes`;
/** 只剥离展示字段；实际版本、格式和重复项校验仍使用共享契约。 */
export const scopeFormSchema = {
  safeParse(input: unknown) {
    const value =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};
    const selected = scopeOptionSchema.array().safeParse(value.scopes);
    if (!selected.success) return selected;
    return setIdentityScopesSchema.safeParse({
      version: value.version,
      scopes: selected.data.map(({ type, value }) => ({ type, value })),
    });
  },
};
export const scopeSelections = (input: unknown): ScopeOption[] => {
  const parsed = scopeOptionSchema.array().safeParse(input);
  return parsed.success ? parsed.data : [];
};
const actionNames = {
  view: "查看",
  create: "新增",
  update: "修改",
  delete: "删除",
  import: "导入",
  export: "导出",
  approve: "审核",
  sensitive: "查看敏感信息",
};
export const scopePermissionOptions = scopePermissionSchema.options.map(
  (permission) => {
    const [app, feature, action] = permission.split(":");
    const definition = appDefinitions.find((item) => item.code === app);
    const name =
      Object.entries(definition?.features ?? {}).find(
        ([key]) => key === feature,
      )?.[1].name ?? "学校业务";
    return {
      id: permission,
      name: `${definition?.name} / ${name} · ${actionNames[action as keyof typeof actionNames]}`,
    };
  },
);
export const scopeWarnings = {
  missing_department: "未分配部门，当前部门档位的实际可见范围为空。",
  unsupported_identity: "当前组织的范围计算暂未开放。",
  permission_not_granted:
    "该成员未获得所选操作权限，负责范围不会额外授予操作权限。",
};
