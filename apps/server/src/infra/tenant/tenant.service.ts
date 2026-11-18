import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { validate } from "uuid";
import { ApiException } from "../../api-response.js";
import { DataSourceRegistry } from "../../database/registry.js";
import { schoolSchemaName } from "./schema-name.js";
import { createSchoolTables } from "./school-tables.js";
import { TenantRepository } from "./tenant.repository.js";

export type SchoolDatabase = Readonly<{
  db: NodePgDatabase;
  t: ReturnType<typeof createSchoolTables>;
}>;

@Injectable()
export class TenantService {
  private readonly cache = new Map<
    string,
    { revision: string; value: SchoolDatabase }
  >();
  private observedRevision: string | undefined;

  constructor(
    @Inject(TenantRepository) private readonly repository: TenantRepository,
    @Inject(DataSourceRegistry) private readonly sources: DataSourceRegistry,
  ) {}

  private synchronize(revision: string) {
    if (this.observedRevision !== revision) {
      this.cache.clear();
      this.observedRevision = revision;
    }
  }

  /** 返回指定学校的数据库与限定 schema 的表；调用方仍需通过学校权限守卫。 */
  async forSchool(schoolId: string): Promise<SchoolDatabase> {
    if (!validate(schoolId)) throw new ApiException(90004);
    const id = schoolId.toLowerCase();
    const revision = await this.repository.revision();
    this.synchronize(revision);
    const cached = this.cache.get(id);
    if (cached?.revision === revision) return cached.value;

    const snapshot = await this.repository.snapshot(id);
    if (
      snapshot?.tenant.status !== "active" ||
      snapshot.tenant.schemaName !== schoolSchemaName(id)
    ) {
      throw new ApiException(90004);
    }
    this.synchronize(snapshot.revision);
    const existing = this.cache.get(id);
    if (existing?.revision === snapshot.revision) return existing.value;
    const { datasource, schemaName } = snapshot.tenant;
    const value = Object.freeze({
      db: this.sources.get(datasource).db,
      t: createSchoolTables(schemaName),
    });
    // 有界缓存；版本失效后重新建表对象，不依赖进程间消息的投递时序。
    if (this.cache.size >= 1000) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    this.cache.set(id, { revision: snapshot.revision, value });
    return value;
  }

  onApplicationShutdown() {
    this.cache.clear();
  }
}
