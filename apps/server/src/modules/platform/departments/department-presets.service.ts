import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { v7 } from "uuid";
import { DepartmentStatisticsRepository } from "./department-statistics.repository.js";
import { DepartmentsRepository } from "./departments.repository.js";

const presets = [
  ["research", "研发部"],
  ["sales", "销售部"],
  ["production", "生产部"],
  ["support", "技术服务部"],
] as const;
@Injectable()
export class DepartmentPresetsService implements OnApplicationBootstrap {
  constructor(
    @Inject(DepartmentsRepository)
    private readonly repository: DepartmentsRepository,
    @Inject(DepartmentStatisticsRepository)
    private readonly statistics: DepartmentStatisticsRepository,
  ) {}
  async onApplicationBootstrap() {
    for (const company of await this.statistics.companies())
      await this.initializeCompany(company.id);
  }
  /** 公司初始化流程复用；按稳定编码判断，保留预置部门后续改名和移动。 */
  initializeCompany(orgId: string) {
    return this.repository.transaction(async (tx) => {
      const org = await this.repository.organization(tx, orgId, true);
      if (org?.type !== "company") return;
      const existing = await this.repository.list(tx, orgId);
      for (const [sort, [key, name]] of presets.entries()) {
        const code = `PRESET_${key}`;
        if (existing.some((row) => row.code === code)) continue;
        const id = v7();
        await this.repository.insert(tx, {
          id,
          orgId,
          name,
          code,
          path: id,
          sort,
          isPreset: true,
        });
      }
    });
  }
}
