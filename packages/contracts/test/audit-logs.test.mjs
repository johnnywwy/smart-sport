import assert from "node:assert/strict";
import test from "node:test";
import { auditLogExample } from "../dist/audit-log-examples.js";
import {
  auditLogListSchema,
  auditLogQuerySchema,
  auditLogSchema,
} from "../dist/index.js";

test("审计查询默认本组织，严格校验分页、时间及目标条件", () => {
  assert.deepEqual(auditLogQuerySchema.parse({}), {
    scope: "organization",
    page: 1,
    pageSize: 20,
    sort: "createdAt:desc",
  });
  assert.ok(
    auditLogQuerySchema.safeParse({
      scope: "platform",
      page: "2",
      pageSize: "100",
      from: "2026-11-18T00:00:00+08:00",
      to: "2026-11-18T00:00:00+08:00",
      action: " role.update ",
    }).success,
  );
  for (const input of [
    { scope: "all" },
    { orgId: auditLogExample.orgId },
    { pageSize: 101 },
    { userId: "invalid" },
    { action: " " },
    { from: "2026-11-18" },
    { from: "2026-11-19T00:00:00Z", to: "2026-11-18T23:00:00Z" },
    { targetId: auditLogExample.targetId },
    { sort: "action:desc" },
  ])
    assert.equal(auditLogQuerySchema.safeParse(input).success, false);
  assert.ok(
    auditLogQuerySchema.safeParse({
      targetType: "role",
      targetId: auditLogExample.targetId,
    }).success,
  );
});
test("审计响应保留真实归属、允许账号级空身份，无修改能力", () => {
  assert.ok(
    auditLogListSchema.safeParse({
      items: [auditLogExample],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  );
  assert.ok(
    auditLogSchema.safeParse({
      ...auditLogExample,
      identityId: null,
      identityType: null,
      orgId: null,
      organizationName: null,
      changes: null,
    }).success,
  );
  assert.equal(
    auditLogSchema.safeParse({ ...auditLogExample, allowedActions: ["delete"] })
      .success,
    false,
  );
});
