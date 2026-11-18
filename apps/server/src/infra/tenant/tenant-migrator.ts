import { Inject, Injectable } from "@nestjs/common";
import type pg from "pg";
import { ApiException } from "../../api-response.js";
import { MigrationError } from "../../database/migration-files.js";
import { DataSourceRegistry } from "../../database/registry.js";
import {
  MigrationRegistry,
  type MigrationTenant,
} from "./migration-registry.js";
import { schoolSchemaName } from "./schema-name.js";
import {
  applySchoolMigrations,
  readSchoolMigrations,
  type SchoolMigrations,
  schoolMigrationDirectory,
} from "./school-migrations.js";
import { TenantRepository } from "./tenant.repository.js";

export type SchoolMigrationResult =
  | {
      schoolId: string;
      status: "active";
      schemaVersion: number;
      applied: string[];
    }
  | {
      schoolId: string;
      status: "failed";
      error: string;
      failureRecorded: boolean;
    };

async function rollback(client: pg.PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // 保留原始失败，最终丢弃连接。
  }
}

@Injectable()
export class TenantMigrator {
  constructor(
    @Inject(DataSourceRegistry) private readonly sources: DataSourceRegistry,
    @Inject(TenantRepository) private readonly repository: TenantRepository,
  ) {}

  /** 迁移已登记且可迁移的学校；按固定批次限制并发，逐校返回安全结果。 */
  async migrateAll(options: { directory?: URL; batchSize?: number } = {}) {
    const batchSize = options.batchSize ?? 10;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) {
      throw new MigrationError("学校迁移每批数量必须为1至10");
    }
    const files = await readSchoolMigrations(
      options.directory ?? schoolMigrationDirectory,
    );
    const ids = await this.repository.migrationCandidates();
    const results: SchoolMigrationResult[] = [];
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      const batch = await Promise.all(
        ids.slice(offset, offset + batchSize).map(async (schoolId) => {
          try {
            return await this.run(schoolId, files);
          } catch {
            // 选中后被停用/删除的学校也不能阻断本批其他学校。
            return {
              schoolId,
              status: "failed" as const,
              error: "学校登记已变化或不可迁移",
              failureRecorded: false,
            };
          }
        }),
      );
      results.push(...batch);
    }
    return results;
  }

  /** 单校重试以目标库历史为准；非学校、停用、删除等不可迁移对象返回404。 */
  async migrateSchool(schoolId: string, directory = schoolMigrationDirectory) {
    try {
      schoolSchemaName(schoolId);
    } catch {
      throw new ApiException(90004);
    }
    return this.run(
      schoolId.toLowerCase(),
      await readSchoolMigrations(directory),
    );
  }

  /** 内部开通入口：复用迁移锁、目标历史和跨库提交恢复路径。 */
  async provisionSchool(
    schoolId: string,
    options: { directory?: URL; datasource?: string } = {},
  ) {
    try {
      schoolSchemaName(schoolId);
    } catch {
      throw new ApiException(90004);
    }
    return this.run(
      schoolId.toLowerCase(),
      await readSchoolMigrations(options.directory ?? schoolMigrationDirectory),
      options,
    );
  }

  private async run(
    schoolId: string,
    files: SchoolMigrations,
    provision?: { datasource?: string },
  ): Promise<SchoolMigrationResult> {
    let client: pg.PoolClient | undefined;
    let target: pg.PoolClient | undefined;
    let registry: MigrationRegistry | undefined;
    let tenant: MigrationTenant | undefined;
    let failed = false;
    try {
      client = await this.sources.get().pool.connect();
      registry = new MigrationRegistry(client);
      await registry.lock(schoolId);
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      if (provision) {
        await registry.prepareProvision(schoolId, provision.datasource);
        // 先持久化登记，后续DDL失败才能保留failed名单；成功状态仍与DDL同事务。
        await client.query("COMMIT");
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      }
      tenant = await registry.tenant(schoolId, Boolean(provision));
      if (!tenant) throw new ApiException(90004);
      if (tenant.schema_name !== schoolSchemaName(schoolId)) {
        throw new MigrationError("学校库名称与学校不匹配");
      }
      target =
        tenant.datasource === "default"
          ? client
          : await this.sources.get(tenant.datasource).pool.connect();
      if (target !== client) {
        await target.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      }
      if (provision) {
        // 与增量迁移使用同一目标事务锁；schema名只由UUID生成并验证。
        const schema = schoolSchemaName(schoolId);
        await target.query(
          "SELECT pg_advisory_xact_lock(1936749167, hashtext($1))",
          [schema],
        );
        await target.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      }
      const result = await applySchoolMigrations(target, schoolId, files);
      // 非默认库先提交目标DDL，再更新公库；中断后可按目标历史安全重跑。
      if (target !== client) await target.query("COMMIT");
      await registry.success(tenant, result.schemaVersion);
      if (provision)
        await registry.provisionAudit(tenant, result.schemaVersion);
      await client.query("COMMIT");
      return { schoolId, status: "active", ...result };
    } catch (error) {
      failed = true;
      if (target && target !== client) await rollback(target);
      if (client) await rollback(client);
      if (error instanceof ApiException) throw error;
      const message =
        error instanceof MigrationError
          ? error.message
          : "学校迁移失败，请检查数据源、连接及登记权限";
      let failureRecorded = false;
      if (tenant && registry) {
        try {
          failureRecorded = provision
            ? await registry.provisionFailure(tenant, message)
            : await registry.failure(tenant, message);
        } catch {
          // 公库故障时明确报告未登记；不把成功提交的目标迁移再执行一遍。
        }
      }
      return { schoolId, status: "failed", error: message, failureRecorded };
    } finally {
      if (target && target !== client) target.release(failed);
      if (client) {
        try {
          await registry?.unlock(schoolId);
        } catch {
          failed = true;
        }
        client.release(failed);
      }
    }
  }
}
