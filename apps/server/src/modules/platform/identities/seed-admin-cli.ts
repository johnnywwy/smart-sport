import { loadConfig, loadDatabaseConfig } from "@smart-sport/config/env";
import { and, eq, isNull } from "drizzle-orm";
import { v7 } from "uuid";
import { DataSourceRegistry } from "../../../database/registry.js";
import { identities, organizations, users } from "../../../schema/public.js";

const config = loadConfig("server");
if (!config.demoSeedEnabled) {
  console.error("生产环境禁止初始化演示管理员身份");
  process.exitCode = 1;
} else {
  const registry = new DataSourceRegistry(loadDatabaseConfig());
  try {
    const db = registry.get().db;
    const result = await db.transaction(async (tx) => {
      const [admin] = await tx
        .select()
        .from(users)
        .where(and(eq(users.username, "admin"), isNull(users.deletedAt)))
        .limit(1);
      if (!admin) throw new Error("未找到 admin 账号，请先创建开发管理员账号");

      let [company] = await tx
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.type, "company"),
            eq(organizations.code, "ORG_PLATFORM"),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(1);
      if (!company) {
        [company] = await tx
          .insert(organizations)
          .values({
            id: v7(),
            type: "company",
            name: "智慧体育云平台",
            code: "ORG_PLATFORM",
            status: 1,
          })
          .returning();
      }
      if (!company) throw new Error("平台公司创建失败");

      let [identity] = await tx
        .select()
        .from(identities)
        .where(
          and(
            eq(identities.userId, admin.id),
            eq(identities.orgId, company.id),
            eq(identities.type, "company"),
            isNull(identities.deletedAt),
          ),
        )
        .limit(1);
      if (!identity) {
        [identity] = await tx
          .insert(identities)
          .values({
            id: v7(),
            userId: admin.id,
            orgId: company.id,
            type: "company",
            title: "平台超级管理员",
            status: 1,
            sort: 0,
          })
          .returning();
      } else if (identity.status !== 1 || identity.title !== "平台超级管理员") {
        [identity] = await tx
          .update(identities)
          .set({
            status: 1,
            title: "平台超级管理员",
            updatedAt: new Date(),
          })
          .where(eq(identities.id, identity.id))
          .returning();
      }
      if (!identity) throw new Error("admin 公司身份创建失败");
      await tx
        .update(users)
        .set({ lastIdentityId: identity.id, updatedAt: new Date() })
        .where(eq(users.id, admin.id));
      return { companyId: company.id, identityId: identity.id };
    });
    console.log(
      `开发管理员身份已就绪：company=${result.companyId} identity=${result.identityId}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "开发管理员身份初始化失败",
    );
    process.exitCode = 1;
  } finally {
    await registry.onApplicationShutdown();
  }
}
