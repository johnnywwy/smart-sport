import { Inject, Injectable } from "@nestjs/common";
import type { AuditLogQuery } from "@smart-sport/contracts";
import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import { DRIZZLE } from "../../../database/registry.js";
import {
  auditLogs,
  identities,
  organizations,
  users,
} from "../../../schema/public.js";

/** LIKE通配符按用户输入字面匹配，参数仍由Drizzle绑定。 */
function containsName(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
const schools = alias(organizations, "audit_school");
@Injectable()
export class AuditQueryRepository {
  constructor(@Inject(DRIZZLE) private readonly database: NodePgDatabase) {}

  /** 组织边界始终来自服务端，和动作、时间等条件一起进入计数及行查询。 */
  list(input: AuditLogQuery, orgId: string | null) {
    return this.database.transaction(
      async (tx) => {
        const condition = and(
          orgId ? eq(auditLogs.orgId, orgId) : undefined,
          input.action ? eq(auditLogs.action, input.action) : undefined,
          input.userId
            ? eq(auditLogs.userId, input.userId.toLowerCase())
            : undefined,
          input.operatorName
            ? ilike(users.realName, containsName(input.operatorName))
            : undefined,
          input.organizationName
            ? ilike(organizations.name, containsName(input.organizationName))
            : undefined,
          input.targetType
            ? eq(auditLogs.targetType, input.targetType)
            : undefined,
          input.targetId
            ? eq(auditLogs.targetId, input.targetId.toLowerCase())
            : undefined,
          input.from
            ? gte(auditLogs.createdAt, new Date(input.from))
            : undefined,
          input.to ? lte(auditLogs.createdAt, new Date(input.to)) : undefined,
        );
        const direction = input.sort === "createdAt:asc" ? asc : desc;
        const items = await tx
          .select({
            log: auditLogs,
            operatorName: users.realName,
            identityType: identities.type,
            organizationName: organizations.name,
            schoolName: schools.name,
          })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.userId))
          .leftJoin(identities, eq(identities.id, auditLogs.identityId))
          .leftJoin(organizations, eq(organizations.id, auditLogs.orgId))
          .leftJoin(schools, eq(schools.id, auditLogs.schoolId))
          .where(condition)
          .orderBy(direction(auditLogs.createdAt), direction(auditLogs.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);
        const [total] = await tx
          .select({ count: count() })
          .from(auditLogs)
          .leftJoin(users, eq(users.id, auditLogs.userId))
          .leftJoin(organizations, eq(organizations.id, auditLogs.orgId))
          .where(condition);
        return {
          items,
          total: total?.count ?? 0,
          page: input.page,
          pageSize: input.pageSize,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
}
export type AuditQueryRow = Awaited<
  ReturnType<AuditQueryRepository["list"]>
>["items"][number];
