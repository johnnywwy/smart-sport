import { sql } from "drizzle-orm";
import {
  check,
  index,
  type PgSchema,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../../database/common-columns.js";

import type { createSchoolClassTables } from "./school-class-tables.js";

export function createSchoolStudentTables(
  schema: PgSchema,
  { classes, teachingClasses }: ReturnType<typeof createSchoolClassTables>,
) {
  const students = schema.table(
    "students",
    {
      ...commonColumns(),
      studentNo: text("student_no").notNull(),
      name: text("name").notNull(),
      gender: smallint("gender").notNull(),
      birthday: timestamp("birthday", { withTimezone: true }).notNull(),
      idType: text("id_type").notNull(),
      idCardEnc: text("id_card_enc").notNull(),
      idCardHash: varchar("id_card_hash", { length: 64 }).notNull(),
      classId: uuid("class_id")
        .notNull()
        .references(() => classes.id),
      status: text("status")
        .$type<"studying" | "transferred_out" | "graduated" | "suspended">()
        .notNull()
        .default("studying"),
      studentIndexId: uuid("student_index_id").notNull(),
    },
    (t) => [
      check("students_version_check", sql`${t.version} >= 0`),
      check(
        "students_student_no_check",
        sql`length(btrim(${t.studentNo})) > 0`,
      ),
      check("students_name_check", sql`length(btrim(${t.name})) > 0`),
      check("students_gender_check", sql`${t.gender} IN (1,2)`),
      check(
        "students_document_check",
        sql`length(btrim(${t.idType})) > 0 AND length(${t.idCardEnc}) > 0 AND ${t.idCardHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "students_status_check",
        sql`${t.status} IN ('studying','transferred_out','graduated','suspended')`,
      ),
      uniqueIndex("students_student_no_active_unique")
        .on(t.studentNo)
        .where(sql`${t.deletedAt} IS NULL`),
      index("students_class_id_idx")
        .on(t.classId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("students_student_index_id_idx")
        .on(t.studentIndexId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  const teachingClassStudents = schema.table(
    "teaching_class_students",
    {
      ...commonColumns(),
      teachingClassId: uuid("teaching_class_id")
        .notNull()
        .references(() => teachingClasses.id),
      studentId: uuid("student_id")
        .notNull()
        .references(() => students.id),
    },
    (t) => [
      check("teaching_class_students_version_check", sql`${t.version} >= 0`),
      uniqueIndex("teaching_class_students_class_student_active_unique")
        .on(t.teachingClassId, t.studentId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("teaching_class_students_student_id_idx")
        .on(t.studentId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  const studentEnrollments = schema.table(
    "student_enrollments",
    {
      ...commonColumns(),
      studentId: uuid("student_id")
        .notNull()
        .references(() => students.id),
      academicYearId: uuid("academic_year_id").notNull(),
      classId: uuid("class_id")
        .notNull()
        .references(() => classes.id),
    },
    (t) => [
      check("student_enrollments_version_check", sql`${t.version} >= 0`),
      uniqueIndex("student_enrollments_student_year_active_unique")
        .on(t.studentId, t.academicYearId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("student_enrollments_academic_year_id_idx")
        .on(t.academicYearId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("student_enrollments_class_id_idx")
        .on(t.classId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  return { students, teachingClassStudents, studentEnrollments };
}
