import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  type PgSchema,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../../database/common-columns.js";

export function createSchoolTeacherTables(schema: PgSchema) {
  const teacherProfiles = schema.table(
    "teacher_profiles",
    {
      ...commonColumns(),
      identityId: uuid("identity_id").notNull(),
      userId: uuid("user_id").notNull(),
      name: text("name").notNull(),
      gender: smallint("gender").notNull(),
      phoneEnc: text("phone_enc"),
      phoneHash: varchar("phone_hash", { length: 64 }),
    },
    (t) => [
      check("teacher_profiles_version_check", sql`${t.version} >= 0`),
      check("teacher_profiles_name_check", sql`length(btrim(${t.name})) > 0`),
      check("teacher_profiles_gender_check", sql`${t.gender} IN (1,2)`),
      check(
        "teacher_profiles_phone_pair_check",
        sql`(${t.phoneEnc} IS NULL) = (${t.phoneHash} IS NULL)`,
      ),
      check(
        "teacher_profiles_phone_hash_check",
        sql`${t.phoneHash} ~ '^[0-9a-f]{64}$'`,
      ),
      uniqueIndex("teacher_profiles_identity_active_unique")
        .on(t.identityId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("teacher_profiles_user_id_idx")
        .on(t.userId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  const teacherAssignments = schema.table(
    "teacher_assignments",
    {
      ...commonColumns(),
      teacherProfileId: uuid("teacher_profile_id")
        .notNull()
        .references(() => teacherProfiles.id),
      classKind: text("class_kind").$type<"admin" | "teaching">().notNull(),
      classId: uuid("class_id").notNull(),
      academicYearId: uuid("academic_year_id").notNull(),
      semesterId: uuid("semester_id"),
      subject: text("subject").notNull().default("pe"),
      isHead: boolean("is_head").notNull().default(false),
    },
    (t) => [
      check("teacher_assignments_version_check", sql`${t.version} >= 0`),
      check(
        "teacher_assignments_class_kind_check",
        sql`${t.classKind} IN ('admin','teaching')`,
      ),
      check(
        "teacher_assignments_semester_check",
        sql`(${t.classKind} = 'admin' AND ${t.semesterId} IS NULL) OR (${t.classKind} = 'teaching' AND ${t.semesterId} IS NOT NULL)`,
      ),
      check(
        "teacher_assignments_subject_check",
        sql`length(btrim(${t.subject})) > 0`,
      ),
      uniqueIndex("teacher_assignments_teaching_active_unique")
        .on(
          t.teacherProfileId,
          t.classKind,
          t.classId,
          t.academicYearId,
          t.semesterId,
          t.subject,
        )
        .where(sql`${t.deletedAt} IS NULL AND ${t.semesterId} IS NOT NULL`),
      uniqueIndex("teacher_assignments_admin_active_unique")
        .on(
          t.teacherProfileId,
          t.classKind,
          t.classId,
          t.academicYearId,
          t.subject,
        )
        .where(sql`${t.deletedAt} IS NULL AND ${t.semesterId} IS NULL`),
      index("teacher_assignments_class_id_idx")
        .on(t.classId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("teacher_assignments_academic_year_id_idx")
        .on(t.academicYearId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("teacher_assignments_semester_id_idx")
        .on(t.semesterId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  return { teacherProfiles, teacherAssignments };
}
