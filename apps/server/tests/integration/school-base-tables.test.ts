import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { eq, isNull } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { DataSourceRegistry } from "../../src/database/registry.js";
import {
  schoolSchemaName,
  TenantMigrator,
  TenantRepository,
  TenantService,
} from "../../src/infra/tenant/index.js";
import { schoolMigrationDirectory } from "../../src/infra/tenant/school-migrations.js";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

let container: StartedPostgreSqlContainer | undefined;
let sources: DataSourceRegistry;
let migrator: TenantMigrator;
let service: TenantService;
const schools: string[] = [];
const directories: string[] = [];
const names = [
  "colleges",
  "majors",
  "classes",
  "teaching_classes",
  "teaching_class_students",
  "students",
  "student_enrollments",
  "teacher_profiles",
  "teacher_assignments",
].sort();
async function school() {
  const id = v7();
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1::uuid,'school','基础表测试学校',$1::text,'990000')",
      [id],
    );
  return id;
}
async function context() {
  const id = await school();
  expect(await migrator.provisionSchool(id)).toMatchObject({
    status: "active",
    schemaVersion: 1,
  });
  return service.forSchool(id);
}
function student(classId: string, studentNo = "S001") {
  return {
    studentNo,
    name: "测试学生",
    gender: 1,
    birthday: new Date("2015-09-01T00:00:00+08:00"),
    idType: "id_card",
    idCardEnc: "test-ciphertext",
    idCardHash: "a".repeat(64),
    classId,
    studentIndexId: v7(),
  };
}
async function rejectConstraint(promise: PromiseLike<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ cause: { code } });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const remote = new URL(container.getConnectionUri());
  remote.pathname = "/school_base_remote";
  sources = new DataSourceRegistry({
    DATABASE_URL: container.getConnectionUri(),
    EXTRA_DATASOURCES: { remote: remote.href },
  });
  await migratePublic(sources.get().pool);
  await sources.get().pool.query("CREATE DATABASE school_base_remote");
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.regions(code,name,level,path) VALUES('990000','基础表测试省',1,'990000')",
    );
  const repository = new TenantRepository(sources.get().db);
  migrator = new TenantMigrator(sources, repository);
  service = new TenantService(repository, sources);
  for (let i = 0; i < 10; i++) {
    const id = await school();
    schools.push(id);
    expect(await migrator.provisionSchool(id)).toMatchObject({
      status: "active",
      schemaVersion: 1,
    });
  }
}, 120000);
afterAll(async () => {
  await sources?.onApplicationShutdown();
  await container?.stop();
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
}, 30000);

it("两校九表齐全、元数据最新，公共列一致，所有外键均留在本校", async () => {
  for (const id of schools.slice(0, 2)) {
    const { db, t } = await service.forSchool(id);
    const schema = schoolSchemaName(id);
    const business = Object.values(t).filter(
      (table) => getTableConfig(table).name !== "_migrations",
    );
    expect(business.map((table) => getTableConfig(table).name).sort()).toEqual(
      names,
    );
    expect(
      business.every((table) => getTableConfig(table).schema === schema),
    ).toBe(true);
    const actual = await sources
      .get()
      .pool.query(
        "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1",
        [schema],
      );
    for (const name of names) {
      const columns = actual.rows.filter((r) => r.table_name === name);
      for (const column of [
        "id",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "deleted_at",
        "version",
      ])
        expect(columns.some((c) => c.column_name === column)).toBe(true);
      for (const column of ["created_at", "updated_at", "deleted_at"])
        expect(columns.find((c) => c.column_name === column)?.data_type).toBe(
          "timestamp with time zone",
        );
    }
    const foreign = await sources
      .get()
      .pool.query(
        "SELECT target.relnamespace::regnamespace::text AS target_schema FROM pg_constraint c JOIN pg_class origin ON origin.oid=c.conrelid JOIN pg_namespace n ON n.oid=origin.relnamespace JOIN pg_class target ON target.oid=c.confrelid WHERE n.nspname=$1 AND c.contype='f'",
        [schema],
      );
    expect(foreign.rows.length).toBeGreaterThan(0);
    expect(foreign.rows.every((r) => r.target_schema === schema)).toBe(true);
    expect(await db.select().from(t.migrations)).toMatchObject([
      { version: 1, filename: "0001_create_school_base.sql" },
    ]);
    expect(await migrator.provisionSchool(id)).toMatchObject({
      status: "active",
      applied: [],
      schemaVersion: 1,
    });
  }
});

it("50次并发业务读写限定10校，学号相同可跨校，其他校外键不可引用", async () => {
  await Promise.all(
    Array.from({ length: 50 }, async (_, index) => {
      const id = schools[index % 10] as string;
      const { db, t } = await service.forSchool(id);
      const [room] = await db
        .insert(t.classes)
        .values({ stage: 1, entryYear: 2026, classNo: index + 1 })
        .returning();
      await db
        .insert(t.students)
        .values(student(room?.id as string, `S${Math.floor(index / 10)}`));
    }),
  );
  for (const id of schools) {
    const { db, t } = await service.forSchool(id);
    const rows = await db.select().from(t.students);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.studentNo).sort()).toEqual([
      "S0",
      "S1",
      "S2",
      "S3",
      "S4",
    ]);
  }
  const a = await service.forSchool(schools[0] as string);
  const b = await service.forSchool(schools[1] as string);
  const [room] = await a.db.select().from(a.t.classes);
  await rejectConstraint(
    b.db.insert(b.t.students).values(student(room?.id as string, "foreign")),
    "23503",
  );
});

it("行政班含空专业也不能重复，软删除后可重建，大学专业必须匹配学院", async () => {
  const { db, t } = await context();
  const room = { stage: 1, entryYear: 2026, classNo: 1 };
  const [first] = await db.insert(t.classes).values(room).returning();
  await rejectConstraint(db.insert(t.classes).values(room), "23505");
  await db
    .update(t.classes)
    .set({ deletedAt: new Date() })
    .where(eq(t.classes.id, first?.id as string));
  await db.insert(t.classes).values(room);
  const [college] = await db
    .insert(t.colleges)
    .values({ name: "体育学院" })
    .returning();
  const [other] = await db
    .insert(t.colleges)
    .values({ name: "外语学院" })
    .returning();
  const [major] = await db
    .insert(t.majors)
    .values({ collegeId: college?.id as string, name: "体育教育" })
    .returning();
  const university = {
    stage: 4,
    entryYear: 2026,
    classNo: 1,
    collegeId: college?.id,
    majorId: major?.id,
  };
  await db.insert(t.classes).values(university);
  await rejectConstraint(db.insert(t.classes).values(university), "23505");
  await rejectConstraint(
    db
      .insert(t.classes)
      .values({ ...university, classNo: 2, collegeId: other?.id }),
    "23503",
  );
  for (const invalid of [
    { ...room, classNo: 2, stage: 4 },
    { ...university, stage: 1 },
    { ...room, stage: 5 },
    { ...room, classNo: 0 },
    { ...room, status: 2 },
    { ...room, version: -1 },
  ])
    await rejectConstraint(db.insert(t.classes).values(invalid), "23514");
});

it("学生、学籍、教学班成员关联可读写，重复与错误证件哈希被拒绝", async () => {
  const { db, t } = await context();
  const [room] = await db
    .insert(t.classes)
    .values({ stage: 2, entryYear: 2026, classNo: 1 })
    .returning();
  const values = student(room?.id as string);
  const [pupil] = await db.insert(t.students).values(values).returning();
  expect(pupil).toMatchObject({ status: "studying", version: 0 });
  await rejectConstraint(db.insert(t.students).values(values), "23505");
  await rejectConstraint(
    db
      .insert(t.students)
      .values({ ...values, studentNo: "bad-hash", idCardHash: "raw" }),
    "23514",
  );
  await rejectConstraint(
    db
      .insert(t.students)
      .values({ ...values, studentNo: "bad-gender", gender: 3 }),
    "23514",
  );
  const year = v7();
  const enrollment = {
    studentId: pupil?.id as string,
    academicYearId: year,
    classId: room?.id as string,
  };
  await db.insert(t.studentEnrollments).values(enrollment);
  await rejectConstraint(
    db.insert(t.studentEnrollments).values(enrollment),
    "23505",
  );
  const [teaching] = await db
    .insert(t.teachingClasses)
    .values({ academicYearId: year, semesterId: v7(), name: "篮球选修班" })
    .returning();
  const membership = {
    teachingClassId: teaching?.id as string,
    studentId: pupil?.id as string,
  };
  await db.insert(t.teachingClassStudents).values(membership);
  await rejectConstraint(
    db.insert(t.teachingClassStudents).values(membership),
    "23505",
  );
  expect(await db.select().from(t.teachingClassStudents)).toHaveLength(1);
  await db
    .update(t.students)
    .set({ deletedAt: new Date() })
    .where(eq(t.students.id, pupil?.id as string));
  await db.insert(t.students).values(values);
  expect(
    await db.select().from(t.students).where(isNull(t.students.deletedAt)),
  ).toHaveLength(1);
});

it("教师身份唯一，密文哈希配套；两类任课按学年学期去重，默认体育", async () => {
  const { db, t } = await context();
  const profile = {
    identityId: v7(),
    userId: v7(),
    name: "测试教师",
    gender: 2,
  };
  const [teacher] = await db
    .insert(t.teacherProfiles)
    .values(profile)
    .returning();
  await rejectConstraint(db.insert(t.teacherProfiles).values(profile), "23505");
  for (const phone of [
    { phoneEnc: "cipher" },
    { phoneHash: "a".repeat(64) },
    { phoneEnc: "cipher", phoneHash: "bad" },
  ])
    await rejectConstraint(
      db
        .insert(t.teacherProfiles)
        .values({ ...profile, identityId: v7(), ...phone }),
      "23514",
    );
  await db.insert(t.teacherProfiles).values({
    ...profile,
    identityId: v7(),
    phoneEnc: "cipher",
    phoneHash: "b".repeat(64),
  });
  const assignment = {
    teacherProfileId: teacher?.id as string,
    classKind: "admin" as const,
    classId: v7(),
    academicYearId: v7(),
  };
  const [row] = await db
    .insert(t.teacherAssignments)
    .values(assignment)
    .returning();
  expect(row).toMatchObject({ subject: "pe", isHead: false, semesterId: null });
  await rejectConstraint(
    db.insert(t.teacherAssignments).values(assignment),
    "23505",
  );
  await rejectConstraint(
    db.insert(t.teacherAssignments).values({ ...assignment, semesterId: v7() }),
    "23514",
  );
  await rejectConstraint(
    db
      .insert(t.teacherAssignments)
      .values({ ...assignment, classKind: "teaching" }),
    "23514",
  );
  const teaching = {
    ...assignment,
    classKind: "teaching" as const,
    semesterId: v7(),
  };
  await db.insert(t.teacherAssignments).values(teaching);
  await rejectConstraint(
    db.insert(t.teacherAssignments).values(teaching),
    "23505",
  );
  await db
    .insert(t.teacherAssignments)
    .values({ ...teaching, semesterId: v7() });
});

it("真实九表迁移后遇故障全部回滚，修复可重试；非默认数据源也具备九表", async () => {
  const path = await mkdtemp(`${tmpdir()}/school-base-`);
  directories.push(path);
  const dir = pathToFileURL(`${path}/`);
  await writeFile(
    new URL("0001_create_school_base.sql", dir),
    await readFile(
      new URL("0001_create_school_base.sql", schoolMigrationDirectory),
    ),
  );
  await writeFile(new URL("0002_failure.sql", dir), "SELECT 1/0");
  const id = await school();
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "failed",
    failureRecorded: true,
  });
  expect(
    (
      await sources
        .get()
        .pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schoolSchemaName(id),
        ])
    ).rowCount,
  ).toBe(0);
  await expect(service.forSchool(id)).rejects.toMatchObject({ code: 90004 });
  await writeFile(new URL("0002_failure.sql", dir), "SELECT 1");
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "active",
    schemaVersion: 2,
  });
  const remote = await school();
  expect(
    await migrator.provisionSchool(remote, { datasource: "remote" }),
  ).toMatchObject({ status: "active", schemaVersion: 1 });
  const { db, t } = await service.forSchool(remote);
  expect(db).toBe(sources.get("remote").db);
  for (const table of Object.values(t))
    expect(await db.select().from(table)).toHaveLength(
      getTableConfig(table).name === "_migrations" ? 1 : 0,
    );
  expect(
    (
      await sources
        .get()
        .pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schoolSchemaName(remote),
        ])
    ).rowCount,
  ).toBe(0);
});
