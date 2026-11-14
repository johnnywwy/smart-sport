import {
  type IdentitySummary,
  type IdentityType,
  identityTypeNames,
} from "@smart-sport/contracts";

export { identityTypeNames } from "@smart-sport/contracts";

export const identityGroupNames = {
  company: "公司",
  bureau: "教育局",
  agent: "代理商",
  school: "学校",
} as const;

export function expectedOrgType(type: IdentityType) {
  return type === "teacher" || type === "student" || type === "parent"
    ? "school"
    : type;
}

export function groupType(type: IdentityType) {
  return expectedOrgType(type);
}

export type IdentityRow = {
  id: string;
  type: string;
  orgId: string;
  departmentId: string | null;
  title: string | null;
  status: number;
  sort: number;
  orgType: string;
  orgName: string;
  orgStatus: number;
  orgDeletedAt: Date | null;
};

export function presentIdentity(
  row: IdentityRow,
  roleIds: string[],
  lastIdentityId: string | null,
): IdentitySummary {
  const type = row.type as IdentityType;
  const orgMatches = row.orgType === expectedOrgType(type);
  const unsupported = type === "student" || type === "parent";
  const unavailableReason =
    row.status !== 1
      ? "身份已停用"
      : row.orgDeletedAt || row.orgStatus !== 1
        ? "组织已停用"
        : !orgMatches
          ? "身份与组织类型不匹配"
          : unsupported
            ? "该身份暂不支持登录后台"
            : null;
  return {
    id: row.id,
    type,
    typeName: identityTypeNames[type],
    orgId: row.orgId,
    orgName: row.orgName,
    departmentName: null,
    title: row.title,
    roleIds,
    lastUsed: row.id === lastIdentityId,
    available: unavailableReason === null,
    unavailableReason,
  };
}
