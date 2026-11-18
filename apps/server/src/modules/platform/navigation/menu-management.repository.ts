import { Inject, Injectable } from "@nestjs/common";
import type { MenuOverrideChange } from "@smart-sport/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { auditLogs, menuOverrides, menus } from "../../../schema/public.js";
export type MenuTransaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
@Injectable()
export class MenuManagementRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(action: (tx: MenuTransaction) => Promise<T>) {
    return this.db.transaction(action);
  }
  async lock(tx: MenuTransaction) {
    // 与角色修改、目录同步保持相同锁顺序，避免权限修订触发器与目录锁互相等待。
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167,41)`);
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR SHARE`,
    );
  }
  rows(tx?: MenuTransaction) {
    return (tx ?? this.db)
      .select({ menu: menus, override: menuOverrides })
      .from(menus)
      .leftJoin(
        menuOverrides,
        and(
          eq(menuOverrides.appCode, menus.appCode),
          eq(menuOverrides.menuKey, menus.key),
        ),
      )
      .where(and(eq(menus.status, 1), eq(menus.client, "admin")));
  }
  save(
    tx: MenuTransaction,
    source: { app: string; key: string },
    input: MenuOverrideChange,
  ) {
    return tx
      .insert(menuOverrides)
      .values({
        appCode: source.app,
        menuKey: source.key,
        displayName: input.displayName,
        sort: input.sort,
        hidden: input.hidden,
        version: 1,
      })
      .onConflictDoUpdate({
        target: [menuOverrides.appCode, menuOverrides.menuKey],
        set: {
          displayName: input.displayName,
          sort: input.sort,
          hidden: input.hidden,
          updatedAt: sql`now()`,
          version: sql`${menuOverrides.version}+1`,
        },
      });
  }
  audit(tx: MenuTransaction, input: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(input);
  }
}
