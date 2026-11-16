import {
  createSchoolProfileSchema,
  type DataScopeOption,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import {
  SchoolProfilesRepository,
  SchoolProfilesService,
} from "../../src/modules/platform/school-profiles/index.js";
import { scopeFixture } from "./scope.js";

export async function schoolProfileFixture() {
  const f = await scopeFixture();
  let nextCode = 1;
  const input = () =>
    createSchoolProfileSchema.parse({
      schoolCode: String(nextCode++).padStart(10, "0"),
      stages: [1, 2],
      stageYears: { "1": 6, "2": 3 },
      nature: "公办",
      address: "测试路1号",
      contactName: "测试联系人",
      contactPhone: "13812345678",
    });
  const initialize = (schoolId: string, data = input()) =>
    f.app
      .get(SchoolProfilesRepository)
      .transaction((tx) =>
        f.app
          .get(SchoolProfilesService)
          .initialize(tx, schoolId, data, f.admin.identityId),
      );
  const profile = async () => {
    const id = await f.school();
    const data = input();
    await initialize(id, data);
    return { id, input: data, patch: { ...data, version: 0 } };
  };
  const role = async (
    actor: { identityId: string; orgId: string },
    type: "company" | "school" | "agent",
    scope: DataScopeOption,
    level: "view" | "edit",
  ) => {
    const id = v7();
    await f.pool.query(
      `INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id)
       SELECT $1,'custom',$2,$3,$1::uuid::text,'测试档案角色',$4,id FROM public.roles WHERE code=$5`,
      [
        id,
        type,
        actor.orgId,
        scope,
        type === "company" ? "company-super-admin" : `${type}-admin`,
      ],
    );
    await f.pool.query(
      `INSERT INTO public.role_grants(role_id,app_code,feature_code,level)
       SELECT $1,app_code,code,CASE WHEN app_code='school' AND code='profile' THEN $2 ELSE 'none' END FROM public.features`,
      [id, level],
    );
    await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
      actor.identityId,
      id,
    ]);
    return id;
  };
  const rows = async (id: string) =>
    (
      await f.pool.query(
        "SELECT * FROM public.school_profiles WHERE school_id=$1",
        [id],
      )
    ).rows;
  const audits = async (id: string) =>
    (
      await f.pool.query(
        "SELECT action, changes FROM public.audit_logs WHERE target_id=$1 AND action='school.profile.update' ORDER BY created_at",
        [id],
      )
    ).rows;
  return { ...f, profile, initialize, input, profileRole: role, rows, audits };
}
