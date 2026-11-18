import type pg from "pg";
import { v7 } from "uuid";
import { ApiException } from "../../api-response.js";
import { MigrationError } from "../../database/migration-files.js";
import { auditWriter } from "../audit/audit-writer.js";
import { schoolSchemaName } from "./schema-name.js";

export type MigrationTenant = {
  school_id: string;
  schema_name: string;
  datasource: string;
  schema_version: number;
  version: number;
  status: string;
};

/** 迁移专用登记查询；不通过只允许active的业务访问入口获取DDL连接。 */
export class MigrationRegistry {
  constructor(private readonly client: pg.PoolClient) {}

  async lock(schoolId: string) {
    // 默认库的会话锁覆盖目标库提交及登记更新，防止跨库重试互相覆盖状态。
    await this.client.query(
      "SELECT pg_advisory_lock(1936749168, hashtext($1))",
      [schoolId],
    );
  }

  async unlock(schoolId: string) {
    await this.client.query(
      "SELECT pg_advisory_unlock(1936749168, hashtext($1))",
      [schoolId],
    );
  }

  async prepareProvision(schoolId: string, datasource?: string) {
    const school = await this.client.query(
      `SELECT id FROM public.orgs WHERE id=$1 AND type='school'
       AND status=1 AND deleted_at IS NULL FOR UPDATE`,
      [schoolId],
    );
    if (!school.rowCount) throw new ApiException(90004);
    const existing = await this.client.query<
      MigrationTenant & { deleted_at: Date | null }
    >("SELECT * FROM public.school_tenants WHERE school_id=$1 FOR UPDATE", [
      schoolId,
    ]);
    const tenant = existing.rows[0];
    if (tenant) {
      if (
        tenant.deleted_at ||
        !["active", "failed", "provisioning"].includes(tenant.status)
      ) {
        throw new ApiException(90004);
      }
      if (datasource && datasource !== tenant.datasource) {
        throw new MigrationError("已有学校库登记不能通过开通任务切换数据源");
      }
      return;
    }
    await this.client.query(
      `INSERT INTO public.school_tenants(school_id,schema_name,datasource,status)
       VALUES($1,$2,$3,'provisioning')`,
      [schoolId, schoolSchemaName(schoolId), datasource ?? "default"],
    );
  }

  async tenant(schoolId: string, provisioning = false) {
    const result = await this.client.query<MigrationTenant>(
      `SELECT st.school_id,st.schema_name,st.datasource,st.schema_version,st.version,st.status
       FROM public.school_tenants st JOIN public.orgs o ON o.id=st.school_id
       WHERE st.school_id=$1 AND st.deleted_at IS NULL
         AND st.status = ANY($2::text[]) AND o.type='school'
         AND o.status=1 AND o.deleted_at IS NULL
       FOR UPDATE OF st,o`,
      [
        schoolId,
        provisioning
          ? ["active", "failed", "provisioning"]
          : ["active", "failed"],
      ],
    );
    return result.rows[0];
  }

  async provisionAudit(tenant: MigrationTenant, schemaVersion: number) {
    if (tenant.status === "active") return;
    await auditWriter.writeClient(this.client, {
      action: "tenant.provision",
      targetType: "school_tenant",
      targetId: tenant.school_id,
      schoolId: tenant.school_id,
      changes: {
        status: [tenant.status, "active"],
        schemaVersion: [tenant.schema_version, schemaVersion],
      },
      traceId: v7(),
      createdAt: new Date(),
    });
  }

  async success(tenant: MigrationTenant, schemaVersion: number) {
    // 无变化不推进登记版本，避免幂等发布清掉所有学校的业务缓存。
    await this.client.query(
      `UPDATE public.school_tenants
       SET status='active',schema_version=$2,last_error=NULL,
           updated_at=now(),version=version+1
       WHERE school_id=$1 AND version=$3
         AND (schema_version<>$2 OR status<>'active' OR last_error IS NOT NULL)`,
      [tenant.school_id, schemaVersion, tenant.version],
    );
  }

  async failure(tenant: MigrationTenant, message: string) {
    // DDL回滚后可能已有停用/归档操作，不覆盖其新状态。
    const result = await this.client.query(
      `UPDATE public.school_tenants SET status='failed',last_error=$2,
         updated_at=now(),version=version+1
       WHERE school_id=$1 AND version=$3 AND deleted_at IS NULL
         AND status IN ('active','failed','provisioning')`,
      [tenant.school_id, message, tenant.version],
    );
    return result.rowCount === 1;
  }

  async provisionFailure(tenant: MigrationTenant, message: string) {
    await this.client.query("BEGIN");
    try {
      const recorded = await this.failure(tenant, message);
      if (recorded) {
        await auditWriter.writeClient(this.client, {
          action: "tenant.provision.failed",
          targetType: "school_tenant",
          targetId: tenant.school_id,
          schoolId: tenant.school_id,
          changes: { status: [tenant.status, "failed"] },
          traceId: v7(),
          createdAt: new Date(),
        });
      }
      await this.client.query("COMMIT");
      return recorded;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }
}
