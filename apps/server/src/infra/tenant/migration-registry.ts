import type pg from "pg";

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

  async tenant(schoolId: string) {
    const result = await this.client.query<MigrationTenant>(
      `SELECT st.school_id,st.schema_name,st.datasource,st.schema_version,st.version,st.status
       FROM public.school_tenants st JOIN public.orgs o ON o.id=st.school_id
       WHERE st.school_id=$1 AND st.deleted_at IS NULL
         AND st.status IN ('active','failed') AND o.type='school'
         AND o.status=1 AND o.deleted_at IS NULL
       FOR UPDATE OF st,o`,
      [schoolId],
    );
    return result.rows[0];
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
         AND status IN ('active','failed')`,
      [tenant.school_id, message, tenant.version],
    );
    return result.rowCount === 1;
  }
}
