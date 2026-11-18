import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { auditWriter } from "../../../infra/audit/audit-writer.js";
import { type auditLogs, regions } from "../../../schema/public.js";
import type { RegionReference, StoredRegion } from "./region-sync-plan.js";
export type RegionTx = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];
@Injectable()
export class RegionManagementRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}
  transaction<T>(run: (tx: RegionTx) => Promise<T>) {
    return this.db.transaction(run);
  }
  read<T>(run: (tx: RegionTx) => Promise<T>) {
    return this.db.transaction(run, {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
  async lock(tx: RegionTx) {
    await tx.execute(
      sql`SELECT version FROM public.identity_context_revision WHERE singleton=true FOR UPDATE`,
    );
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1936749167,30)`);
    await tx.execute(
      sql`LOCK TABLE public.regions, public.orgs, public.departments, public.identities, public.department_scopes, public.identity_scopes IN SHARE ROW EXCLUSIVE MODE`,
    );
  }
  async snapshot(tx: RegionTx) {
    const rows = await tx.select().from(regions).orderBy(regions.code);
    const refs =
      await tx.execute(sql`SELECT 'organization' AS kind,id::text,name,region_code AS code FROM public.orgs WHERE deleted_at IS NULL AND region_code IS NOT NULL
  UNION ALL SELECT 'department',d.id::text,d.name,s.scope_value FROM public.department_scopes s JOIN public.departments d ON d.id=s.department_id WHERE d.deleted_at IS NULL AND s.scope_type='region'
  UNION ALL SELECT 'identity',i.id::text,u.real_name,s.scope_value FROM public.identity_scopes s JOIN public.identities i ON i.id=s.identity_id JOIN public.users u ON u.id=i.user_id WHERE i.deleted_at IS NULL AND u.deleted_at IS NULL AND s.scope_type='region' ORDER BY kind,id,code`);
    return {
      rows: rows as StoredRegion[],
      references: refs.rows as RegionReference[],
    };
  }
  async organizations(tx: RegionTx) {
    const result = await tx.execute(
      sql`SELECT type,name,region_code AS code,status FROM public.orgs WHERE deleted_at IS NULL AND region_code IS NOT NULL ORDER BY name,id`,
    );
    return result.rows as {
      type: string;
      name: string;
      code: string;
      status: 0 | 1;
    }[];
  }
  async apply(tx: RegionTx, seeds: StoredRegion[]) {
    await tx.update(regions).set({ status: 0 });
    for (let i = 0; i < seeds.length; i += 300)
      await tx
        .insert(regions)
        .values(seeds.slice(i, i + 300))
        .onConflictDoUpdate({
          target: regions.code,
          set: {
            name: sql`excluded.name`,
            level: sql`excluded.level`,
            parentCode: sql`excluded.parent_code`,
            path: sql`excluded.path`,
            status: sql`excluded.status`,
          },
        });
    await tx.execute(
      sql`UPDATE public.identity_context_revision SET version=version+1 WHERE singleton=true`,
    );
  }
  audit(tx: RegionTx, input: typeof auditLogs.$inferInsert) {
    return auditWriter.write(tx, input);
  }
}
