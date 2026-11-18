import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DRIZZLE } from "../../../database/registry.js";
import {
  applications,
  features,
  menuOverrides,
  menus,
} from "../../../schema/public.js";

@Injectable()
export class NavigationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  overrides() {
    return this.db.select().from(menuOverrides);
  }
  apps() {
    return this.db
      .select()
      .from(applications)
      .where(eq(applications.status, 1));
  }
  features() {
    return this.db.select().from(features).where(eq(features.status, 1));
  }
  menus(appCode: string, client: "admin" | "mobile") {
    return this.db
      .select({ menu: menus, override: menuOverrides })
      .from(menus)
      .innerJoin(
        features,
        and(
          eq(features.appCode, menus.appCode),
          eq(features.code, menus.featureCode),
        ),
      )
      .leftJoin(
        menuOverrides,
        and(
          eq(menuOverrides.appCode, menus.appCode),
          eq(menuOverrides.menuKey, menus.key),
        ),
      )
      .where(
        and(
          eq(menus.appCode, appCode),
          eq(menus.client, client),
          eq(menus.status, 1),
          eq(features.status, 1),
        ),
      );
  }
}
