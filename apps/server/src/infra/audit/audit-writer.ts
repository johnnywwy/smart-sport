import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { Audit } from "../../core/audit/audit.decorator.js";
import { auditLogs } from "../../schema/public.js";

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

export class AuditWriter {
  /** 给手动管理BEGIN/COMMIT的基础设施事务使用同一审计清洗器。 */
  @Audit()
  writeClient(client: pg.PoolClient, input: typeof auditLogs.$inferInsert) {
    return drizzle(client).insert(auditLogs).values(input);
  }

  /** 强制接收业务事务，写入失败交给调用方整体回滚。 */
  @Audit()
  write(tx: Transaction, input: typeof auditLogs.$inferInsert) {
    return tx.insert(auditLogs).values(input);
  }
}

export const auditWriter = new AuditWriter();
