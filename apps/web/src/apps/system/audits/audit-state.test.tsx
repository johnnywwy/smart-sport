import { auditLogSchema } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { auditChangeRows, auditValue } from "./audit-changes";
import {
  auditActionName,
  auditIdentity,
  auditResult,
  auditTarget,
  auditTime,
} from "./audit-labels";
import { auditQueryString, initialAuditQuery } from "./audit-state";
import { AuditChanges } from "./components/audit-changes/AuditChanges";
import { AuditList } from "./components/audit-list/AuditList";

const id = "019aa000-0000-7000-8000-000000000001";
const row = auditLogSchema.parse({
  id,
  userId: id,
  identityId: id,
  identityType: "company",
  operatorName: "测试管理员",
  orgId: id,
  organizationName: "示例公司",
  schoolId: null,
  schoolName: null,
  createdAt: "2026-11-18T08:00:00Z",
  action: "system.param.update",
  targetType: "system_param",
  targetId: id,
  changes: {
    value: [30, 31],
    reason: "试用期调整",
    key: "subscription.trial_days",
    passwordHash: "已修改",
    relatedId: id,
  },
  ip: null,
  userAgent: null,
  traceId: null,
  allowedActions: [],
});
it("共享契约编码身份范围和独立分页，按上海日期包含整天，提交名称且忽略展示标签与无关条件", () => {
  const result = Object.fromEntries(
    new URLSearchParams(
      auditQueryString("platform", {
        ...initialAuditQuery,
        page: 2,
        pageSize: 50,
        keyword: "unused",
        filters: {
          action: "system.param.update",
          userId: id,
          operatorName: " 测试管理员 ",
          organizationName: " 示例公司 ",
          operatorLabel: "只供展示",
          from: "2026-11-18",
          to: "2026-11-19",
          organizationId: id,
        },
      }),
    ),
  );
  expect(result).toEqual({
    scope: "platform",
    page: "2",
    pageSize: "50",
    sort: "createdAt:desc",
    action: "system.param.update",
    userId: id,
    operatorName: "测试管理员",
    organizationName: "示例公司",
    from: "2026-11-18T00:00:00+08:00",
    to: "2026-11-19T23:59:59.999+08:00",
  });
  expect(
    new URLSearchParams(
      auditQueryString("organization", {
        ...initialAuditQuery,
        sort: { column: "createdAt", direction: "ascending" },
      }),
    ).get("sort"),
  ).toBe("createdAt:asc");
  for (const filters of [
    { from: "2026-11-20", to: "2026-11-18" },
    { from: "2026-02-30" },
    { to: "bad" },
    { userId: "bad" },
  ])
    expect(() =>
      auditQueryString("platform", { ...initialAuditQuery, filters }),
    ).toThrow();
});
it("身份说明与结果只来自已有事实，不把无结果推断成成功或补上历史角色", () => {
  expect(auditIdentity(row)).toBe("示例公司 · 公司员工");
  expect(auditIdentity({ ...row, identityId: null, identityType: null })).toBe(
    "账号身份（未选择组织）",
  );
  expect(auditResult(row).label).toBe("已记录");
  expect(auditResult({ ...row, changes: { result: "success" } }).label).toBe(
    "成功",
  );
  expect(
    auditResult({ ...row, changes: { result: "bad_password" } }).tone,
  ).toBe("danger");
  expect(auditResult({ ...row, changes: { result: "unknown" } }).label).toBe(
    "已记录",
  );
  expect(auditActionName("preset-role.update")).toBe("修改角色模板");
  expect(auditActionName("secret.unknown")).toBe("其他操作");
  expect(auditTime("2026-11-18T18:01:02Z")).toBe("2026-11-19 02:01:02");
  expect(auditTarget(row)).toBe("系统参数");
});
it("变更白名单展示前后值，嵌套配置不暴露编码与ID，UUID替换多次调用结果稳定", () => {
  expect(auditChangeRows(row.changes)).toEqual([
    { label: "参数值", before: "30", after: "31" },
    { label: "调整原因", value: "试用期调整" },
  ]);
  for (let count = 0; count < 3; count++)
    expect(auditValue(`关联 ${id}`)).toBe("关联 关联记录");
  expect(auditValue("school.schema_secret")).toBe("系统配置项");
  expect(auditValue("KT")).toBe("KT");
  expect(auditValue("dept_and_below")).toBe("本部门及以下");
  expect(auditChangeRows({ status: [0, 1] })).toEqual([
    { label: "状态", before: "停用", after: "启用" },
  ]);
  expect(auditValue({ secret: "hidden" })).toBe("配置内容已调整");
  expect(
    auditChangeRows({
      grants: [
        { id, actions: ["view"] },
        { id, actions: ["update"] },
      ],
    }),
  ).toEqual([{ label: "角色权限", value: "配置内容已调整" }]);
});
it("七列和只读详情按设计结构渲染，不出现技术标识、修改入口或假导出", () => {
  const html = renderToStaticMarkup(
    <AuditList
      identityId="actor"
      scope="platform"
      data={{ items: [row], total: 1, page: 1, pageSize: 20 }}
      query={initialAuditQuery}
      onQueryChange={() => {}}
      status={{}}
      onDetails={() => {}}
    />,
  );
  const text = html.replace(/<[^>]*>/g, "");
  for (const label of [
    "平台操作记录",
    "时间",
    "操作人",
    "当时的身份",
    "操作",
    "对象",
    "结果",
    "详情",
    "开始日期",
    "结束日期",
  ])
    expect(text).toContain(label);
  for (const forbidden of [
    id,
    "system.param.update",
    "subscription.trial_days",
    "passwordHash",
    "导出",
  ])
    expect(text).not.toContain(forbidden);
  expect(html).toContain('aria-label="所在组织"');
  expect(html).toContain('placeholder="操作人姓名"');
  expect(html).not.toMatch(/<button[^>]*>删除<\/button>/);
  const details = renderToStaticMarkup(
    <AuditChanges changes={row.changes} />,
  ).replace(/<[^>]*>/g, "");
  for (const forbidden of [id, "passwordHash", "subscription.trial_days"])
    expect(details).not.toContain(forbidden);
  expect(details).toContain("参数值");
});

it("名称空白不构成查询，超过契约长度拒绝，展示标签不作为姓名搜索", () => {
  const params = new URLSearchParams(
    auditQueryString("platform", {
      ...initialAuditQuery,
      filters: {
        operatorName: " ",
        organizationName: " ",
        userId: id,
        operatorLabel: "原账号",
      },
    }),
  );
  expect(params.has("operatorName")).toBe(false);
  expect(params.has("organizationName")).toBe(false);
  expect(params.has("operatorLabel")).toBe(false);
  expect(params.get("userId")).toBe(id);
  for (const key of ["operatorName", "organizationName"])
    expect(() =>
      auditQueryString("platform", {
        ...initialAuditQuery,
        filters: { [key]: "字".repeat(101) },
      }),
    ).toThrow();
});
