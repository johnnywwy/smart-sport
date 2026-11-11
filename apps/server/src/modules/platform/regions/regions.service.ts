import { Inject, Injectable } from "@nestjs/common";
import type { Region, RegionQuery } from "@smart-sport/contracts";
import { RegionsRepository } from "./regions.repository.js";

@Injectable()
export class RegionsService {
  constructor(
    @Inject(RegionsRepository) private readonly regions: RegionsRepository,
  ) {}

  async list(query: RegionQuery): Promise<Region[]> {
    const rows = await this.regions.listEnabled(query.parent);
    return rows.map((row) => ({
      ...row,
      level: row.level as Region["level"],
    }));
  }
}
