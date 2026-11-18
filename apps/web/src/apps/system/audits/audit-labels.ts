import type { AuditLog } from "@smart-sport/contracts";

export const auditActions = [
  ["auth.login", "登录"],
  ["auth.logout", "退出登录"],
  ["auth.password.change", "修改密码"],
  ["identity.select", "选择组织身份"],
  ["organization.create", "新增机构"],
  ["organization.update", "修改机构"],
  ["organization.toggle", "启停机构"],
  ["department.create", "新增部门"],
  ["department.update", "修改部门"],
  ["department.move", "调整部门层级"],
  ["department.delete", "删除部门"],
  ["department.scopes.update", "调整部门负责范围"],
  ["role.create", "新增角色"],
  ["role.update", "修改角色权限"],
  ["role.reset", "恢复基础角色"],
  ["preset-role.update", "修改角色模板"],
  ["preset-role.reset", "恢复角色模板"],
  ["member.create", "新增成员身份"],
  ["member.update", "修改成员身份"],
  ["member.status", "启停成员身份"],
  ["identity.scopes.update", "调整本人负责范围"],
  ["school.profile.update", "修改学校档案"],
  ["academic.year.create", "新建学年"],
  ["academic.semester.update", "调整学期日期"],
  ["academic.semester.set_current", "切换当前学期"],
  ["dict.item.create", "新增字典选项"],
  ["dict.item.update", "修改字典选项"],
  ["dict.item.delete", "删除字典选项"],
  ["number.rule.update", "修改编号规则"],
  ["system.param.update", "修改系统参数"],
  ["system.region.import", "同步行政区划"],
  ["system.menu.update", "修改菜单设置"],
] as const;
export const auditActionName = (action: string) =>
  auditActions.find(([key]) => key === action)?.[1] ?? "其他操作";
const identityNames = {
  company: "公司员工",
  bureau: "教育局成员",
  agent: "代理商成员",
  school: "学校成员",
  teacher: "教师",
  student: "学生",
  parent: "家长",
};
export function auditIdentity(row: AuditLog) {
  if (!row.identityId) return "账号身份（未选择组织）";
  return `${row.organizationName ?? "原组织"} · ${row.identityType ? identityNames[row.identityType] : "原身份"}`;
}
export function auditTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replaceAll("/", "-");
}
export function auditResult(row: AuditLog): {
  label: string;
  tone: "success" | "danger" | "neutral";
} {
  const value = auditRecord(row.changes)?.result;
  if (value === "success") return { label: "成功", tone: "success" };
  if (value === "bad_password") return { label: "登录失败", tone: "danger" };
  if (value === "disabled") return { label: "账号已停用", tone: "danger" };
  if (value === "locked") return { label: "账号已锁定", tone: "danger" };
  if (value === "captcha_required")
    return { label: "需要验证码", tone: "neutral" };
  return { label: "已记录", tone: "neutral" };
}
export function auditRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const targetNames: Record<string, string> = {
  user: "账号",
  session: "登录会话",
  user_session: "登录会话",
  identity: "组织身份",
  org: "机构",
  organization: "机构",
  department: "部门",
  role: "角色",
  preset_role: "角色模板",
  school_profile: "学校档案",
  academic_year: "学年",
  semester: "学期",
  dict_item: "字典选项",
  number_rule: "编号规则",
  system_param: "系统参数",
  menu: "菜单",
  region: "行政区划",
  region_catalog: "行政区划目录",
  regions: "行政区划",
};
export function auditTarget(row: AuditLog) {
  return (
    row.schoolName ??
    (row.targetType ? (targetNames[row.targetType] ?? "业务记录") : "账号操作")
  );
}
