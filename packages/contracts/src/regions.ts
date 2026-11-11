import { z } from "zod";

export const regionCodeSchema = z.string().regex(/^\d{6}$/);
export const regionLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const regionSchema = z.object({
  code: regionCodeSchema,
  name: z.string().min(1),
  level: regionLevelSchema,
  parentCode: regionCodeSchema.nullable(),
  path: z.string().regex(/^\d{6}(?:\.\d{6}){0,2}$/),
});

export const regionListSchema = z.array(regionSchema);
export const regionQuerySchema = z.object({
  parent: regionCodeSchema.optional(),
});

export type Region = z.infer<typeof regionSchema>;
export type RegionQuery = z.infer<typeof regionQuerySchema>;
