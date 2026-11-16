import type { scopeSchoolSchema } from "@smart-sport/contracts";
export type SchoolChoice = Pick<
  ReturnType<typeof scopeSchoolSchema.parse>,
  "id" | "name" | "regionName"
>;
