import {
  type SystemParam,
  systemParamQuerySchema,
  systemParamValueSchema,
  type UpdateSystemParam,
  updateSystemParamSchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";
export const initialParamQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export function paramQueryString(query: TableQuery) {
  const direction = query.sort?.direction === "descending" ? "desc" : "asc";
  const field = query.sort?.column === "updatedAt" ? "updatedAt" : "name";
  const raw = {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
    sort: `${field}:${direction}`,
  };
  systemParamQuerySchema.parse(raw);
  return new URLSearchParams(
    Object.entries(raw).map(([key, value]) => [key, String(value)]),
  ).toString();
}
export function paramValues(row: SystemParam): Partial<UpdateSystemParam> {
  return { value: row.value, reason: "" };
}
export function paramFormSchema(row: SystemParam) {
  return updateSystemParamSchema.extend({
    value: systemParamValueSchema(row.key),
  });
}
export function paramValueLabel(row: SystemParam) {
  if (row.key === "password.expire_days" && row.value === 0) return "不限";
  if (row.key === "subscription.grace_days" && row.value === 0)
    return "无宽限期";
  return `${row.key === "login.lock_threshold" ? "连续 " : ""}${row.value} ${row.unit}`;
}
export function paramDescription(row: SystemParam) {
  return row.key === "login.lock_threshold"
    ? "连续登录失败的锁定次数。登录锁定功能尚未启用。"
    : row.remark;
}
export function paramUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replaceAll("/", "-");
}
