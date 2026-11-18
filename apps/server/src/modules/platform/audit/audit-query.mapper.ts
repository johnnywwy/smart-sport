import { auditLogSchema } from "@smart-sport/contracts";
import { auditChanges } from "../../../core/audit/audit-changes.js";
import type { AuditQueryRow } from "./audit-query.repository.js";

/** 历史记录也在读取时去除标准敏感值，不覆盖原始审计。名称为关联实体当前名称。 */
export function auditLogResponse(row: AuditQueryRow) {
  return auditLogSchema.parse({
    ...row.log,
    createdAt: row.log.createdAt.toISOString(),
    operatorName: row.operatorName,
    identityType: row.identityType,
    organizationName: row.organizationName,
    schoolName: row.schoolName,
    changes: auditChanges(row.log.changes),
    allowedActions: [],
  });
}
