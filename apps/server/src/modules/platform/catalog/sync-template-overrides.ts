import { appDefinitions } from "@smart-sport/contracts";
import type pg from "pg";

/** 删除代码已移除的功能覆盖，保留其余平台修改及资源版本。 */
export async function cleanTemplateOverrides(client: pg.PoolClient) {
  const active = appDefinitions.flatMap((app) =>
    Object.keys(app.features).map((feature) => `${app.code}:${feature}`),
  );
  const changed = await client.query<{ role_id: string }>(
    `
    UPDATE public.preset_role_overrides o SET grants=(
      SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) FROM jsonb_array_elements(o.grants) g
      WHERE ((g->>'app') || ':' || (g->>'feature'))=ANY($1::text[])
    ), updated_at=now(), version=version+1
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(o.grants) g
      WHERE NOT (((g->>'app') || ':' || (g->>'feature'))=ANY($1::text[])))
    RETURNING role_id`,
    [active],
  );
  if (changed.rows.length)
    await client.query(
      "UPDATE public.roles SET version=version+1 WHERE id=ANY($1::uuid[])",
      [changed.rows.map((r) => r.role_id)],
    );
  await client.query(`DELETE FROM public.preset_role_overrides o USING public.roles r
    WHERE o.role_id=r.id AND (r.code='company-super-admin' OR r.status=0 OR (o.grants='[]'::jsonb AND o.data_scope IS NULL AND o.remark IS NULL))`);
}

export async function templateSnapshots(client: pg.PoolClient) {
  const result = await client.query<{ id: string; fingerprint: string }>(`
    SELECT r.id, md5(jsonb_build_array(r.name,r.identity_type,r.data_scope,r.remark,r.status,
      COALESCE((SELECT jsonb_agg(jsonb_build_array(g.app_code,g.feature_code,g.level,g.actions) ORDER BY g.app_code,g.feature_code)
        FROM public.role_grants g WHERE g.role_id=r.id),'[]'::jsonb))::text) AS fingerprint
    FROM public.roles r WHERE r.kind='preset' AND r.deleted_at IS NULL`);
  return new Map(result.rows.map((row) => [row.id, row.fingerprint]));
}
export async function advanceChangedTemplates(
  client: pg.PoolClient,
  before: Map<string, string>,
) {
  const after = await templateSnapshots(client);
  const ids = [...after]
    .filter(([id, value]) => before.has(id) && before.get(id) !== value)
    .map(([id]) => id);
  if (ids.length)
    await client.query(
      "UPDATE public.roles SET version=version+1 WHERE id=ANY($1::uuid[])",
      [ids],
    );
}
