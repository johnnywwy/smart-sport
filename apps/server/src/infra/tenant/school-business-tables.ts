import type { PgSchema } from "drizzle-orm/pg-core";
import { createSchoolClassTables } from "./school-class-tables.js";
import { createSchoolStudentTables } from "./school-student-tables.js";
import { createSchoolTeacherTables } from "./school-teacher-tables.js";

/** 所有表显式绑定学校schema；public标识只存UUID，禁止跨库外键。 */
export function createSchoolBusinessTables(schema: PgSchema) {
  const classes = createSchoolClassTables(schema);
  return {
    ...classes,
    ...createSchoolStudentTables(schema, classes),
    ...createSchoolTeacherTables(schema),
  };
}
