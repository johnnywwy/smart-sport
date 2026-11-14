import { Injectable } from "@nestjs/common";
import type { MemberListQuery } from "@smart-sport/contracts";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  departments,
  identities,
  organizations,
  users,
} from "../../../schema/public.js";
import type { MemberTransaction } from "./members.repository.js";

@Injectable()
export class MemberListRepository {
  async list(
    tx: MemberTransaction,
    orgId: string,
    input: MemberListQuery,
    path?: string,
  ) {
    const keyword = input.keyword?.replace(/[\\%_]/g, "\\$&");
    const filter = and(
      eq(identities.orgId, orgId),
      isNull(identities.deletedAt),
      isNull(users.deletedAt),
      inArray(identities.type, [
        "company",
        "bureau",
        "agent",
        "school",
        "teacher",
      ]),
      input.identityType ? eq(identities.type, input.identityType) : undefined,
      input.status !== undefined
        ? eq(identities.status, input.status)
        : undefined,
      keyword
        ? or(
            ilike(users.username, `%${keyword}%`),
            ilike(users.realName, `%${keyword}%`),
          )
        : undefined,
      input.departmentId === "unassigned"
        ? isNull(identities.departmentId)
        : input.departmentId
          ? input.includeDescendants && path
            ? or(
                eq(identities.departmentId, input.departmentId),
                sql`${departments.path} LIKE ${`${path}.%`}`,
              )
            : eq(identities.departmentId, input.departmentId)
          : undefined,
    );
    const [{ total = 0 } = {}] = await tx
      .select({ total: count() })
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .leftJoin(
        departments,
        and(
          eq(departments.id, identities.departmentId),
          isNull(departments.deletedAt),
        ),
      )
      .where(filter);
    const [field, direction] = input.sort.split(":");
    const column =
      field === "createdAt" ? identities.createdAt : users.realName;
    const rows = await tx
      .select({
        identity: identities,
        user: users,
        departmentName: departments.name,
      })
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .leftJoin(
        departments,
        and(
          eq(departments.id, identities.departmentId),
          isNull(departments.deletedAt),
        ),
      )
      .where(filter)
      .orderBy(
        direction === "desc" ? desc(column) : asc(column),
        asc(identities.id),
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    return { rows, total };
  }
  otherIdentities(tx: MemberTransaction, userId: string, orgId: string) {
    return tx
      .select({
        orgName: organizations.name,
        type: identities.type,
        status: identities.status,
      })
      .from(identities)
      .innerJoin(organizations, eq(organizations.id, identities.orgId))
      .where(
        and(
          eq(identities.userId, userId),
          ne(identities.orgId, orgId),
          isNull(identities.deletedAt),
          isNull(organizations.deletedAt),
        ),
      )
      .orderBy(organizations.name, identities.type);
  }
}
