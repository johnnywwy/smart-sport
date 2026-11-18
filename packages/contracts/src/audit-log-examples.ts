import { auditLogSchema } from "./audit-logs.js";

export const auditLogExample = auditLogSchema.parse({
  id: "019aa000-0000-7000-8000-000000000001",
  createdAt: "2026-11-18T08:00:00.000Z",
  userId: "019aa000-0000-7000-8000-000000000002",
  operatorName: "演示管理员",
  identityId: "019aa000-0000-7000-8000-000000000003",
  identityType: "company",
  orgId: "019aa000-0000-7000-8000-000000000004",
  organizationName: "演示公司",
  schoolId: null,
  schoolName: null,
  action: "system.param.update",
  targetType: "system_param",
  targetId: "019aa000-0000-7000-8000-000000000005",
  changes: { value: [30, 31], reason: "调整新服务试用期" },
  ip: "127.0.0.1",
  userAgent: "演示浏览器",
  traceId: "019aa000-0000-7000-8000-000000000006",
  allowedActions: [],
});
