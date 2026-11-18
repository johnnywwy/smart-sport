import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";

/** 分区名只能由数据库返回的上海月份生成，不接收请求中的表名。 */
export function auditPartition(month: string) {
  if (!/^\d{4}_(0[1-9]|1[0-2])$/.test(month))
    throw new Error("审计分区月份不合法");
  const year = Number(month.slice(0, 4)),
    number = Number(month.slice(5));
  if (year < 1 || (year === 9999 && number === 12))
    throw new Error("审计分区年份超出范围");
  return {
    name: `audit_logs_${month}`,
    from: `${month.replace("_", "-")}-01T00:00:00+08:00`,
    to: `${String(number === 12 ? year + 1 : year).padStart(4, "0")}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01T00:00:00+08:00`,
  };
}

@Injectable()
export class AuditPartitionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async prepare() {
    return this.db.transaction(async (tx) => {
      // 包括跨实例维护与正常写入；移动兜底数据、挂接新分区必须一起完成。
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(
        sql`LOCK TABLE public.audit_logs IN ACCESS EXCLUSIVE MODE`,
      );
      const months = await tx.execute<{ month: string }>(sql`
        SELECT DISTINCT to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY_MM') AS month
        FROM public.audit_logs_default
        UNION
        SELECT to_char(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
          + offset_month * interval '1 month','YYYY_MM') AS month
        FROM generate_series(0,2) AS offset_month
        ORDER BY month
      `);
      for (const { month } of months.rows) {
        const { name, from, to } = auditPartition(month);
        const exists = await tx.execute(
          sql`SELECT to_regclass(${`public.${name}`}) AS name`,
        );
        if (exists.rows[0]?.name) continue;
        const table = sql`public.${sql.identifier(name)}`;
        await tx.execute(
          sql`CREATE TABLE ${table} (LIKE public.audit_logs INCLUDING ALL)`,
        );
        await tx.execute(sql`
          WITH moved AS (
            DELETE FROM public.audit_logs_default
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            RETURNING *
          ) INSERT INTO ${table} SELECT * FROM moved
        `);
        // PostgreSQL 的分区界限不接受绑定参数；两个字面量只来自上面的严格月份校验。
        await tx.execute(sql`ALTER TABLE public.audit_logs ATTACH PARTITION ${table}
          FOR VALUES FROM (${sql.raw(`'${from}'`)}) TO (${sql.raw(`'${to}'`)})`);
      }
    });
  }
}
