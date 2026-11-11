import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import { regions } from "../../../schema/public.js";

@Injectable()
export class RegionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  listEnabled(parentCode: string | undefined) {
    return this.db
      .select({
        code: regions.code,
        name: regions.name,
        level: regions.level,
        parentCode: regions.parentCode,
        path: regions.path,
      })
      .from(regions)
      .where(
        and(
          eq(regions.status, 1),
          parentCode === undefined
            ? isNull(regions.parentCode)
            : eq(regions.parentCode, parentCode),
        ),
      )
      .orderBy(asc(regions.code));
  }
}
