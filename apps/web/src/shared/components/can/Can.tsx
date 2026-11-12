import type { PermissionCode } from "@smart-sport/contracts";
import type { ReactNode } from "react";

// 权限由调用方提供；展示组件不读取身份状态或自行推断角色权限。
export function Can({
  perm,
  permissions,
  children,
}: {
  perm: PermissionCode;
  permissions: readonly PermissionCode[];
  children: ReactNode;
}) {
  return permissions.includes(perm) ? children : null;
}
