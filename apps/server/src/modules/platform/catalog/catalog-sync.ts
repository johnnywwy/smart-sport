import {
  appDefinitions,
  type FeatureGrant,
  presetRoles,
} from "@smart-sport/contracts";
import type pg from "pg";
import { v7 } from "uuid";

import {
  advanceChangedTemplates,
  cleanTemplateOverrides,
  templateSnapshots,
} from "./sync-template-overrides.js";

type SyncCounts = {
  apps: number;
  features: number;
  menus: number;
  roles: number;
  grants: number;
};

function grantValues(grant: FeatureGrant) {
  return {
    level: grant.level,
    actions: grant.level === "custom" ? grant.actions : null,
  };
}

/** 将代码声明同步为数据库目录；用户菜单覆盖存放在独立表中，不参与写入。 */
export async function syncCatalog(pool: pg.Pool): Promise<SyncCounts> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SELECT pg_advisory_xact_lock(1936749167, 41)");
    const templateVersions = await templateSnapshots(client);
    const now = new Date();
    const activeApps: string[] = [];
    let featureCount = 0;
    let menuCount = 0;
    for (const app of appDefinitions) {
      activeApps.push(app.code);
      await client.query(
        `INSERT INTO public.apps (code,name,description,icon,identity_types,sort,status,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,icon=EXCLUDED.icon,identity_types=EXCLUDED.identity_types,sort=EXCLUDED.sort,status=1,updated_at=EXCLUDED.updated_at`,
        [
          app.code,
          app.name,
          app.description,
          app.icon,
          app.identityTypes,
          app.sort,
          now,
        ],
      );
      const activeFeatures = Object.keys(app.features);
      for (const [code, feature] of Object.entries(app.features)) {
        featureCount += 1;
        await client.query(
          `INSERT INTO public.features (app_code,code,name,actions,status,updated_at)
           VALUES ($1,$2,$3,$4,1,$5)
           ON CONFLICT (app_code,code) DO UPDATE SET name=EXCLUDED.name,actions=EXCLUDED.actions,status=1,updated_at=EXCLUDED.updated_at`,
          [app.code, code, feature.name, feature.actions, now],
        );
      }
      await client.query(
        "UPDATE public.features SET status=0,updated_at=$3 WHERE app_code=$1 AND NOT (code=ANY($2::text[]))",
        [app.code, activeFeatures, now],
      );
      const activeMenus = app.menus.map(({ key }) => key);
      for (const menu of app.menus) {
        menuCount += 1;
        await client.query(
          `INSERT INTO public.menus (app_code,parent_key,key,name,path,icon,feature_code,client,sort,status,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)
           ON CONFLICT (app_code,key) DO UPDATE SET parent_key=EXCLUDED.parent_key,name=EXCLUDED.name,path=EXCLUDED.path,icon=EXCLUDED.icon,feature_code=EXCLUDED.feature_code,client=EXCLUDED.client,sort=EXCLUDED.sort,status=1,updated_at=EXCLUDED.updated_at`,
          [
            app.code,
            menu.parentKey ?? null,
            menu.key,
            menu.name,
            menu.path,
            menu.icon ?? null,
            menu.feature,
            menu.client ?? "admin",
            menu.sort,
            now,
          ],
        );
      }
      await client.query(
        "UPDATE public.menus SET status=0,updated_at=$3 WHERE app_code=$1 AND NOT (key=ANY($2::text[]))",
        [app.code, activeMenus, now],
      );
    }
    await client.query(
      "UPDATE public.apps SET status=0,updated_at=$2 WHERE NOT (code=ANY($1::text[]))",
      [activeApps, now],
    );

    const activeRoleCodes = presetRoles.map(({ code }) => code);
    let grantCount = 0;
    for (const role of presetRoles) {
      const roleResult = await client.query<{ id: string }>(
        `INSERT INTO public.roles (id,kind,identity_type,code,name,data_scope,default_department,status,updated_at)
         VALUES ($1,'preset',$2,$3,$4,$5,$6,1,$7)
         ON CONFLICT (code) WHERE kind='preset' AND deleted_at IS NULL
         DO UPDATE SET identity_type=EXCLUDED.identity_type,name=EXCLUDED.name,data_scope=EXCLUDED.data_scope,default_department=EXCLUDED.default_department,status=1,updated_at=EXCLUDED.updated_at
         RETURNING id`,
        [
          v7(),
          role.identityType,
          role.code,
          role.name,
          role.dataScope,
          "defaultDepartment" in role ? role.defaultDepartment : null,
          now,
        ],
      );
      const roleId = roleResult.rows[0]?.id;
      if (!roleId) throw new Error(`内置角色同步失败：${role.code}`);
      const activeGrants: string[] = [];
      for (const [appCode, features] of Object.entries(role.grants)) {
        for (const [featureCode, grant] of Object.entries(
          features as Record<string, FeatureGrant>,
        )) {
          grantCount += 1;
          activeGrants.push(`${appCode}:${featureCode}`);
          const values = grantValues(grant);
          await client.query(
            `INSERT INTO public.role_grants (role_id,app_code,feature_code,level,actions)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (role_id,app_code,feature_code) DO UPDATE SET level=EXCLUDED.level,actions=EXCLUDED.actions`,
            [roleId, appCode, featureCode, values.level, values.actions],
          );
        }
      }
      await client.query(
        "DELETE FROM public.role_grants WHERE role_id=$1 AND NOT ((app_code || ':' || feature_code)=ANY($2::text[]))",
        [roleId, activeGrants],
      );
    }
    await client.query(
      "UPDATE public.roles SET status=0,updated_at=$2 WHERE kind='preset' AND deleted_at IS NULL AND NOT (code=ANY($1::text[]))",
      [activeRoleCodes, now],
    );
    await cleanTemplateOverrides(client);
    await advanceChangedTemplates(client, templateVersions);
    await client.query("COMMIT");
    return {
      apps: activeApps.length,
      features: featureCount,
      menus: menuCount,
      roles: activeRoleCodes.length,
      grants: grantCount,
    };
  } catch (error) {
    failed = true;
    try {
      await client.query("ROLLBACK");
    } catch {
      // 保留原始同步错误并丢弃连接。
    }
    throw error;
  } finally {
    client.release(failed);
  }
}
