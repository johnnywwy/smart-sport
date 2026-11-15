import { Injectable } from "@nestjs/common";
import type { ExtraScope } from "@smart-sport/contracts";
import { eq, sql } from "drizzle-orm";
import { departmentScopes } from "../../../schema/public.js";
import type { DepartmentTransaction } from "./departments.repository.js";

@Injectable()
export class DepartmentScopesRepository {
  lockPermissions(tx: DepartmentTransaction) {
    // 与角色、模板、成员撤权共用写锁，排队后必须重读操作人权限。
    return tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167, 41)`);
  }
  read(tx: DepartmentTransaction, departmentId: string) {
    return tx
      .select({
        type: departmentScopes.scopeType,
        value: departmentScopes.scopeValue,
      })
      .from(departmentScopes)
      .where(eq(departmentScopes.departmentId, departmentId))
      .orderBy(departmentScopes.scopeType, departmentScopes.scopeValue);
  }
  async replace(
    tx: DepartmentTransaction,
    departmentId: string,
    scopes: ExtraScope[],
  ) {
    await tx
      .delete(departmentScopes)
      .where(eq(departmentScopes.departmentId, departmentId));
    if (scopes.length)
      await tx.insert(departmentScopes).values(
        scopes.map(({ type, value }) => ({
          departmentId,
          scopeType: type,
          scopeValue: value,
        })),
      );
  }
}
