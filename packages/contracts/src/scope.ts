import { z } from "zod";

// No school filters means the whole school. Present filters are ORed; all-empty arrays grant nothing.
export const schoolSelectionSchema = z.object({
  kind: z.literal("school"),
  schoolId: z.string().min(1),
  grades: z.array(z.int().positive()).optional(),
  classIds: z.array(z.string().min(1)).optional(),
  collegeIds: z.array(z.string().min(1)).optional(),
});
export const visibleScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all-schools") }),
  z.object({
    kind: z.literal("schools"),
    schoolIds: z.array(z.string().min(1)),
  }),
  schoolSelectionSchema,
  z.object({ kind: z.literal("self"), studentId: z.string().min(1) }),
  z.object({
    kind: z.literal("children"),
    studentIds: z.array(z.string().min(1)),
  }),
]);
export type SchoolSelection = z.infer<typeof schoolSelectionSchema>;
export type VisibleScope = z.infer<typeof visibleScopeSchema>;
