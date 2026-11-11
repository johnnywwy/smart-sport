import { z } from "zod";

export * from "./errors.js";

export const idSchema = z.uuidv7();
export const dateSchema = z.iso.date();
export const timestampSchema = z.iso.datetime({ offset: true });
export const versionSchema = z.int().nonnegative();

const queryInteger = (schema: z.ZodNumber) =>
  z
    .union([z.string().regex(/^\d+$/).transform(Number), z.number()])
    .pipe(schema);
const pageSchema = z.int().positive();
const pageSizeSchema = pageSchema.max(100);

export const paginationQuerySchema = z.object({
  page: queryInteger(pageSchema).default(1),
  pageSize: queryInteger(pageSizeSchema).default(20),
});

export function paginatedSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    total: z.int().nonnegative(),
    page: pageSchema,
    pageSize: pageSizeSchema,
  });
}

export const fieldErrorsSchema = z.object({
  fields: z.record(z.string(), z.array(z.string()).min(1)),
});

const responseMetadata = {
  message: z.string().min(1),
  traceId: z.string().min(1),
};

export function successResponseSchema<Data extends z.ZodType>(data: Data) {
  return z.object({ ...responseMetadata, code: z.literal(0), data });
}

export function errorResponseSchema<Data extends z.ZodType>(data: Data) {
  return z.object({
    ...responseMetadata,
    code: z.int().min(10000).max(99999),
    data,
  });
}

export function responseSchema<Data extends z.ZodType>(data: Data) {
  return z.union([successResponseSchema(data), errorResponseSchema(z.json())]);
}

// 客户端先校验统一信封，再用各接口契约解析 data。
export const apiResponseSchema = responseSchema(z.unknown());

export const livenessSchema = z.object({ status: z.literal("alive") });

export const readinessSchema = z.object({
  status: z.enum(["ready", "unavailable"]),
  checks: z.object({
    postgres: z.boolean(),
    redis: z.boolean(),
    minio: z.boolean(),
  }),
});
export type Readiness = z.infer<typeof readinessSchema>;

export * from "./auth.js";
export * from "./permissions.js";
export * from "./scope.js";
