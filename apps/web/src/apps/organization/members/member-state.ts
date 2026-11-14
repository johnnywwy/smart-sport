import {
  type AssignableMemberRole,
  appDefinitions,
  createMemberSchema,
  type Member,
  type MemberDepartmentOption,
  type MemberListQuery,
  updateMemberSchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";
import {
  actionLabels,
  configurationGroups,
  type PermissionRole,
  previewActions,
  scopeLabels,
} from "../../../shared/components/role-permissions/permission-state";
import type { PermissionPreviewNode } from "../../../shared/components/role-permissions/preview-tree";
import type { FormSchema } from "../../../shared/components/schema-form/types";

export const initialMemberQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export function memberQuery(
  query: TableQuery,
  departmentId?: string,
): MemberListQuery {
  return {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword,
    includeDescendants: query.filters.descendants === "true",
    sort:
      query.sort?.column === "realName" && query.sort.direction === "descending"
        ? "realName:desc"
        : "realName:asc",
    ...((departmentId ?? query.filters.department)
      ? { departmentId: (departmentId ?? query.filters.department) as string }
      : {}),
    ...(query.filters.status
      ? { status: Number(query.filters.status) as 0 | 1 }
      : {}),
  };
}
export function memberValues(row: Member) {
  return {
    version: row.version,
    departmentId: row.departmentId,
    title: row.title,
    roleIds: row.roles.map((role) => role.id),
  };
}
export type NewMemberDraft = {
  mode: "new" | "existing";
  username: string;
  realName: string;
  phone: string;
  email: string;
  account: string;
  departmentId: string | null;
  title: string | null;
  roleIds: string[];
};
/** 只转换平面字段，业务校验与错误消息完全由共享契约提供。 */
export const newMemberFormSchema: FormSchema<NewMemberDraft> = {
  safeParse(input) {
    const value = input as NewMemberDraft;
    const parsed = createMemberSchema.safeParse({
      account:
        value.mode === "existing"
          ? { mode: "existing", account: value.account }
          : {
              mode: "new",
              username: value.username,
              realName: value.realName,
              ...(value.phone ? { phone: value.phone } : {}),
              ...(value.email ? { email: value.email } : {}),
            },
      departmentId: value.departmentId,
      roleIds: value.roleIds,
      title: value.title || null,
    });
    if (parsed.success)
      return {
        success: true,
        data: {
          ...value,
          departmentId: parsed.data.departmentId,
          title: parsed.data.title,
          roleIds: parsed.data.roleIds,
        },
      };
    return {
      success: false,
      error: {
        issues: parsed.error.issues.map((issue) => ({
          ...issue,
          path:
            issue.path[0] === "account"
              ? [
                  issue.path[1] === "account"
                    ? "account"
                    : (issue.path[1] ?? "account"),
                ]
              : issue.path,
        })),
      },
    };
  },
};
export function createMemberBody(value: NewMemberDraft) {
  return createMemberSchema.parse({
    account:
      value.mode === "existing"
        ? { mode: "existing", account: value.account }
        : {
            mode: "new",
            username: value.username,
            realName: value.realName,
            ...(value.phone ? { phone: value.phone } : {}),
            ...(value.email ? { email: value.email } : {}),
          },
    departmentId: value.departmentId,
    roleIds: value.roleIds,
    title: value.title || null,
  });
}
export function combinedRolePreview(
  roles: readonly AssignableMemberRole[],
  identityType: Member["identityType"],
) {
  const grants: PermissionRole["grants"] = appDefinitions.flatMap((app) =>
    Object.entries(app.features).map(([feature, definition]) => {
      const actions = [
        ...new Set(
          roles.flatMap((role) =>
            role.grants
              .filter((g) => g.app === app.code && g.feature === feature)
              .flatMap((g) => previewActions(g.app, g.feature, g.grant)),
          ),
        ),
      ];
      return {
        app: app.code,
        appName: app.name,
        feature,
        featureName: definition.name,
        grant: { level: "custom" as const, actions },
        defaultGrant: { level: "none" as const },
        modified: false,
      };
    }),
  );
  const scopeOrder = ["personal", "dept", "dept_and_below", "all"] as const;
  const groups = configurationGroups({ identityType, grants });
  return groups.flatMap((group) => {
    const menus: PermissionPreviewNode[] = group.items.flatMap((menu) => {
      const features = menu.features.flatMap((feature) => {
        const actions = previewActions(
          feature.app,
          feature.feature,
          feature.grant,
        );
        if (!actions.includes("view")) return [];
        const children = actions.map((action) => {
          const granted = roles.filter((role) =>
            role.grants.some(
              (grant) =>
                grant.app === feature.app &&
                grant.feature === feature.feature &&
                previewActions(grant.app, grant.feature, grant.grant).includes(
                  action,
                ),
            ),
          );
          const scope = scopeOrder.reduce(
            (selected, candidate) =>
              granted.some((role) => role.dataScope === candidate)
                ? candidate
                : selected,
            "personal" as (typeof scopeOrder)[number],
          );
          return {
            key: `${group.key}:${menu.key}:${feature.app}:${feature.feature}:${action}`,
            name: `${actionLabels[action]}${menu.features.length > 1 && menu.key !== "classes" ? `（${feature.featureName}）` : ""} · ${scopeLabels[scope]}`,
            children: [],
          };
        });
        return [
          {
            key: `${group.key}:${menu.key}:${feature.app}:${feature.feature}`,
            name: feature.featureName,
            children,
          },
        ];
      });
      if (!features.length) return [];
      return [
        {
          key: `${group.key}:${menu.key}`,
          name: menu.name,
          children:
            menu.key === "classes"
              ? features
              : features.flatMap((feature) => feature.children),
        },
      ];
    });
    return menus.length
      ? [{ key: group.key, name: group.name, children: menus }]
      : [];
  });
}
export type BatchFailure = { row: Member; message: string; conflict: boolean };
export async function runMemberBatch(
  rows: readonly Member[],
  save: (row: Member) => Promise<unknown>,
  isCancelled: () => boolean = () => false,
) {
  const succeeded: string[] = [];
  const failures: BatchFailure[] = [];
  for (const row of rows) {
    if (isCancelled()) break;
    try {
      await save(row);
      succeeded.push(row.id);
    } catch (error) {
      if (isCancelled()) break;
      failures.push({
        row,
        message:
          error instanceof Error ? error.message : "操作失败，请稍后重试",
        conflict:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 90002,
      });
    }
  }
  return { succeeded, failures };
}

export const editMemberFormSchema: FormSchema<
  ReturnType<typeof updateMemberSchema.parse>
> = {
  safeParse(input) {
    const value = input as Record<string, unknown>;
    return updateMemberSchema.safeParse({
      ...value,
      title: value.title || null,
    });
  },
};

export function memberDepartmentPath(
  items: readonly MemberDepartmentOption[],
  id: string | null,
): string {
  if (!id) return "未分配部门";
  const names: string[] = [];
  const visited = new Set<string>();
  let current = items.find((item) => item.id === id);
  if (!current) return "部门已不可用";
  while (current && !visited.has(current.id)) {
    names.unshift(current.name);
    visited.add(current.id);
    current = items.find((item) => item.id === current?.parentId);
  }
  return names.join(" / ");
}
