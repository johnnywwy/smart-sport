import type pg from "pg";
import { v7 } from "uuid";
/** 已开通学校的显式测试前置数据；迁移本身不为存量学校自动开通服务。 */
export async function seedSchoolService(pool: pg.Pool, schoolId: string) {
  await pool.query(
    `INSERT INTO public.school_subscriptions(id,school_id,no,contract_no,service_start,service_end,grace_days,status)
    VALUES($1,$2,$1::uuid::text,'测试合同',date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' - interval '1 day',date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'+interval '365 days',30,'active') ON CONFLICT(school_id) WHERE deleted_at IS NULL DO NOTHING`,
    [v7(), schoolId],
  );
  for (const code of ["school", "org"])
    await pool.query(
      `INSERT INTO public.school_apps(id,school_id,app_code,start_date,end_date,source) SELECT $1,school_id,$3,service_start,service_end,'contract' FROM public.school_subscriptions WHERE school_id=$2 AND deleted_at IS NULL ON CONFLICT(school_id,app_code) WHERE deleted_at IS NULL DO NOTHING`,
      [v7(), schoolId, code],
    );
}
