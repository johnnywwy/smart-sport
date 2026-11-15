import type { DataScopeOption } from "@smart-sport/contracts";
import { v7 } from "uuid";
import { roleManagementFixture } from "./role-management.js";

export async function scopeFixture() {
  const f = await roleManagementFixture();
  await f.pool.query(`
    INSERT INTO public.regions(code,name,level,parent_code,path) VALUES
    ('990100','市甲',2,'990000','990000.990100'),
    ('990101','区甲',3,'990100','990000.990100.990101'),
    ('990200','市乙',2,'990000','990000.990200'),
    ('980000','其他省',1,NULL,'980000')`);
  const school = async (region = "990101") => {
    const id = v7();
    await f.pool.query(
      "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1,'school','范围测试学校',$1::uuid::text,$2)",
      [id, region],
    );
    return id;
  };
  const department = async (
    orgId = f.admin.orgId,
    parent?: { id: string; path: string },
  ) => {
    const id = v7();
    const path = parent ? `${parent.path}.${id}` : id;
    await f.pool.query(
      "INSERT INTO public.departments(id,org_id,parent_id,path,name,code) VALUES($1,$2,$3,$4,$1::uuid::text,$1::uuid::text)",
      [id, orgId, parent?.id ?? null, path],
    );
    return { id, path };
  };
  const role = async (
    identityId: string,
    orgId: string,
    scope: DataScopeOption,
    level: "none" | "view" | "edit" | "manage" = "view",
  ) => {
    const id = v7();
    await f.pool.query(
      "INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id) SELECT $1,'custom','company',$2,$1::uuid::text,$1::uuid::text,$3,id FROM public.roles WHERE code='company-super-admin'",
      [id, orgId, scope],
    );
    // 明确覆盖所有其他功能，避免继承超管基础角色的管理权限。
    await f.pool.query(
      "INSERT INTO public.role_grants(role_id,app_code,feature_code,level) SELECT $1,app_code,code,CASE WHEN app_code='school' AND code='student' THEN $2 ELSE 'none' END FROM public.features",
      [id, level],
    );
    await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
      identityId,
      id,
    ]);
    return id;
  };
  const personal = (identityId: string, type: string, value: string) =>
    f.pool.query("INSERT INTO public.identity_scopes VALUES($1,$2,$3)", [
      identityId,
      type,
      value,
    ]);
  const responsibility = (departmentId: string, type: string, value: string) =>
    f.pool.query("INSERT INTO public.department_scopes VALUES($1,$2,$3)", [
      departmentId,
      type,
      value,
    ]);
  const assign = (identityId: string, departmentId: string | null) =>
    f.pool.query("UPDATE public.identities SET department_id=$2 WHERE id=$1", [
      identityId,
      departmentId,
    ]);
  return { ...f, school, department, role, personal, responsibility, assign };
}
