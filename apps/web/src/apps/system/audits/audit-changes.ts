import { auditRecord } from "./audit-labels";

const labels: Record<string, string> = {
  name: "名称",
  realName: "姓名",
  label: "选项名称",
  description: "说明",
  remark: "备注",
  reason: "调整原因",
  value: "参数值",
  enabled: "启用状态",
  visible: "显示状态",
  status: "状态",
  sort: "顺序",
  prefix: "编号前缀",
  digits: "流水位数",
  reset: "重置周期",
  resetCycle: "重置周期",
  startDate: "开始日期",
  endDate: "结束日期",
  startYear: "起始年份",
  dataScope: "数据范围",
  level: "权限档位",
  actions: "按钮权限",
  grants: "角色权限",
  scopes: "负责范围",
  responsibilities: "负责范围",
  title: "职务",
  mustChangePassword: "首次改密",
  result: "处理结果",
  phone: "手机号",
  email: "邮箱",
  schoolTypes: "学段",
  schoolYears: "学制",
};
const values: Record<string, string> = {
  all: "本机构全部",
  dept_and_below: "本部门及以下",
  dept: "本部门",
  department: "本部门",
  personal: "本人负责",
  none: "不可见",
  view: "查看",
  edit: "编辑",
  manage: "管理",
  custom: "自定义",
  yearly: "每年",
  daily: "每天",
  current: "当前",
  closed: "已结束",
  pending: "待处理",
  never: "不重置",
  success: "成功",
  bad_password: "登录失败",
  disabled: "账号已停用",
  locked: "账号已锁定",
  captcha_required: "需要验证码",
};
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未设置";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (typeof value === "string")
    return (
      values[value] ??
      (uuid.test(value)
        ? value.replace(new RegExp(uuid.source, "gi"), "关联记录")
        : /^[a-z][a-z0-9]*[_.:-][a-z0-9_.:-]+$/i.test(value)
          ? "系统配置项"
          : value)
    );
  return "配置内容已调整";
}
export function auditChangeRows(changes: unknown) {
  const entries = Object.entries(auditRecord(changes) ?? {});
  const fieldValue = (key: string, value: unknown) =>
    key === "status" && (value === 0 || value === 1)
      ? value === 1
        ? "启用"
        : "停用"
      : auditValue(value);
  return entries.flatMap(([key, value]) => {
    const label = labels[key];
    if (!label) return [];
    return [
      {
        label,
        ...(Array.isArray(value) &&
        value.length === 2 &&
        ![
          "actions",
          "grants",
          "scopes",
          "responsibilities",
          "schoolTypes",
          "schoolYears",
        ].includes(key)
          ? {
              before: fieldValue(key, value[0]),
              after: fieldValue(key, value[1]),
            }
          : { value: fieldValue(key, value) }),
      },
    ];
  });
}
