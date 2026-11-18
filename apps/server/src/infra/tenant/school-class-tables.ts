import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  type PgSchema,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { commonColumns } from "../../database/common-columns.js";

export function createSchoolClassTables(schema: PgSchema) {
  const colleges = schema.table(
    "colleges",
    {
      ...commonColumns(),
      name: text("name").notNull(),
      sort: integer("sort").notNull().default(0),
    },
    (t) => [
      check("colleges_version_check", sql`${t.version} >= 0`),
      check("colleges_name_check", sql`length(btrim(${t.name})) > 0`),
      uniqueIndex("colleges_name_active_unique")
        .on(t.name)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  const majors = schema.table(
    "majors",
    {
      ...commonColumns(),
      collegeId: uuid("college_id")
        .notNull()
        .references(() => colleges.id),
      name: text("name").notNull(),
    },
    (t) => [
      check("majors_version_check", sql`${t.version} >= 0`),
      check("majors_name_check", sql`length(btrim(${t.name})) > 0`),
      uniqueIndex("majors_college_name_active_unique")
        .on(t.collegeId, t.name)
        .where(sql`${t.deletedAt} IS NULL`),
      unique("majors_id_college_unique").on(t.id, t.collegeId),
    ],
  );
  const classes = schema.table(
    "classes",
    {
      ...commonColumns(),
      stage: integer("stage").notNull(),
      entryYear: integer("entry_year").notNull(),
      classNo: integer("class_no").notNull(),
      name: text("name"),
      collegeId: uuid("college_id").references(() => colleges.id),
      majorId: uuid("major_id"),
      status: smallint("status").notNull().default(1),
    },
    (t) => [
      check("classes_version_check", sql`${t.version} >= 0`),
      check("classes_stage_check", sql`${t.stage} IN (1,2,3,4)`),
      check("classes_entry_year_check", sql`${t.entryYear} BETWEEN 1 AND 9998`),
      check("classes_class_no_check", sql`${t.classNo} > 0`),
      check("classes_status_check", sql`${t.status} IN (0,1)`),
      check(
        "classes_college_major_check",
        sql`(${t.stage} = 4 AND ${t.collegeId} IS NOT NULL AND ${t.majorId} IS NOT NULL) OR (${t.stage} <> 4 AND ${t.collegeId} IS NULL AND ${t.majorId} IS NULL)`,
      ),
      uniqueIndex("classes_grade_no_active_unique")
        .on(t.stage, t.entryYear, t.classNo, t.majorId)
        .where(sql`${t.deletedAt} IS NULL AND ${t.majorId} IS NOT NULL`),
      uniqueIndex("classes_grade_no_without_major_active_unique")
        .on(t.stage, t.entryYear, t.classNo)
        .where(sql`${t.deletedAt} IS NULL AND ${t.majorId} IS NULL`),
      foreignKey({
        name: "classes_major_college_fk",
        columns: [t.majorId, t.collegeId],
        foreignColumns: [majors.id, majors.collegeId],
      }),
      index("classes_college_id_idx")
        .on(t.collegeId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("classes_major_id_idx")
        .on(t.majorId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  const teachingClasses = schema.table(
    "teaching_classes",
    {
      ...commonColumns(),
      academicYearId: uuid("academic_year_id").notNull(),
      semesterId: uuid("semester_id").notNull(),
      name: text("name").notNull(),
      sportItemCode: text("sport_item_code"),
      status: smallint("status").notNull().default(1),
    },
    (t) => [
      check("teaching_classes_version_check", sql`${t.version} >= 0`),
      check("teaching_classes_name_check", sql`length(btrim(${t.name})) > 0`),
      check("teaching_classes_status_check", sql`${t.status} IN (0,1)`),
      index("teaching_classes_academic_year_id_idx")
        .on(t.academicYearId)
        .where(sql`${t.deletedAt} IS NULL`),
      index("teaching_classes_semester_id_idx")
        .on(t.semesterId)
        .where(sql`${t.deletedAt} IS NULL`),
    ],
  );
  return { colleges, majors, classes, teachingClasses };
}
