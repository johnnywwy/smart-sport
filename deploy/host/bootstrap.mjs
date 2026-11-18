// 本部署的空库引导；不替代尚未完成的 T-140 完整业务种子。
import "../../server/node_modules/reflect-metadata/Reflect.js";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { PasswordHasher } from "../../server/dist/infra/crypto/password-hasher.js";
import {
  academicInstant,
  defaultAcademicYear,
} from "../../server/dist/modules/platform/academic/academic-calendar.js";

const require = createRequire(
  new URL("../../server/package.json", import.meta.url),
);
const { loadConfig } = require("@smart-sport/config/env");
const { Pool } = require("pg");
const { v7 } = require("uuid");
const config = loadConfig("server");
if (config.NODE_ENV !== "production")
  throw new Error("此引导只供已配置生产环境的独立空库使用");
if (new URL(config.DATABASE_URL).pathname !== "/smart_sport_m1")
  throw new Error("拒绝初始化非本部署专用数据库");
const pool = new Pool({ connectionString: config.DATABASE_URL });
const credentials = new URL(
  "file:///mnt/data/smart-sport-m1/shared/initial-admin.txt",
);
let password;
try {
  password = (await readFile(credentials, "utf8"))
    .split("\n")
    .find((line) => line.startsWith("password="))
    ?.slice(9);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  password = randomBytes(24).toString("base64url");
  await writeFile(
    credentials,
    `username=admin\npassword=${password}\n首次登录必须修改密码。\n`,
    { flag: "wx", mode: 0o600 },
  );
}
if (!password || password === "123456") throw new Error("生产初始密码无效");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(1936749167,140)");
  let company = (
    await client.query(
      "SELECT id FROM public.orgs WHERE code='ORG_PLATFORM' AND deleted_at IS NULL",
    )
  ).rows[0];
  if (!company) {
    company = { id: v7() };
    await client.query(
      "INSERT INTO public.orgs(id,type,name,code,status) VALUES($1,'company','智慧体育云平台','ORG_PLATFORM',1)",
      [company.id],
    );
  }
  let admin = (
    await client.query(
      "SELECT id FROM public.users WHERE username='admin' AND deleted_at IS NULL",
    )
  ).rows[0];
  if (!admin) {
    admin = { id: v7() };
    await client.query(
      "INSERT INTO public.users(id,username,real_name,password_hash,must_change_password,status) VALUES($1,'admin','平台管理员',$2,true,1)",
      [admin.id, await new PasswordHasher().hash(password)],
    );
    const identityId = v7();
    await client.query(
      "INSERT INTO public.identities(id,user_id,org_id,type,title,status,sort) VALUES($1,$2,$3,'company','平台超级管理员',1,0)",
      [identityId, admin.id, company.id],
    );
    const role = (
      await client.query(
        "SELECT id FROM public.roles WHERE code='company-super-admin' AND kind='preset' AND deleted_at IS NULL",
      )
    ).rows[0];
    if (!role) throw new Error("请先同步应用与内置角色");
    await client.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [identityId, role.id],
    );
    await client.query(
      "UPDATE public.users SET last_identity_id=$1 WHERE id=$2",
      [identityId, admin.id],
    );
    await client.query(
      "INSERT INTO public.audit_logs(id,user_id,identity_id,org_id,action,target_type,target_id,changes,created_at) VALUES($1,$2,$3,$4,'system.init','user',$2,$5,now())",
      [
        v7(),
        admin.id,
        identityId,
        company.id,
        { password: "已修改", initialAdministrator: true },
      ],
    );
  }
  if (
    !(
      await client.query(
        "SELECT id FROM public.academic_years WHERE deleted_at IS NULL LIMIT 1",
      )
    ).rowCount
  ) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const year = Number(today.slice(0, 4)),
      month = Number(today.slice(5, 7));
    const calendar = defaultAcademicYear(month >= 9 ? year : year - 1),
      id = v7();
    await client.query(
      "INSERT INTO public.academic_years(id,name,start_date,end_date,is_current,status) VALUES($1,$2,$3,$4,true,'current')",
      [
        id,
        calendar.name,
        academicInstant(calendar.startDate),
        academicInstant(calendar.endDate),
      ],
    );
    for (const semester of calendar.semesters)
      await client.query(
        "INSERT INTO public.semesters(id,academic_year_id,term,name,start_date,end_date,is_current) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          v7(),
          id,
          semester.term,
          semester.name,
          academicInstant(semester.startDate),
          academicInstant(semester.endDate),
          semester.term === (month >= 2 && month < 9 ? 2 : 1),
        ],
      );
  }
  await client.query("COMMIT");
  console.log(
    "专用库引导完成，已有管理员与日历保持不变；初始凭据保存在服务器受限文件。",
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error(
    "专用库引导失败：",
    error instanceof Error ? error.message : "未知错误",
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
