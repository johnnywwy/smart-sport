import { createHash } from "node:crypto";
import { Body, Param, type PipeTransform, Query } from "@nestjs/common";
import {
  ApiBody,
  ApiParam,
  type ApiParamOptions,
  ApiQuery,
  ApiResponse,
  type OpenAPIObject,
} from "@nestjs/swagger";

type SchemaObject = Extract<ApiParamOptions, { schema: unknown }>["schema"];

import { z } from "zod";
import { invalidRequest } from "./api-response.js";

export class ZodRoutePipe implements PipeTransform {
  constructor(
    private readonly schema: z.ZodType,
    private readonly onInvalid = invalidRequest,
  ) {}

  async transform(value: unknown) {
    const result = await this.schema.safeParseAsync(value);
    if (!result.success) throw this.onInvalid(result.error.issues);
    return result.data;
  }
}

const recursiveSchemas: Record<string, SchemaObject> = {};

/** 将 Zod 的递归定义注册为 OpenAPI 组件，避免嵌套 schema 的引用指向错误根节点。 */
export function withZodSchemas(document: OpenAPIObject): OpenAPIObject {
  return {
    ...document,
    components: {
      ...document.components,
      schemas: { ...document.components?.schemas, ...recursiveSchemas },
    },
  };
}

function openApiSchema(
  schema: z.ZodType,
  io: "input" | "output",
): SchemaObject {
  const { $schema: _dialect, ...document } = z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io,
    cycles: "ref",
  });
  if (!document.definitions) return document as SchemaObject;
  const prefix = `Zod_${createHash("sha256").update(JSON.stringify(document)).digest("hex").slice(0, 16)}_`;
  const normalized = JSON.parse(
    JSON.stringify(document, (key, value: unknown) =>
      key === "$ref" &&
      typeof value === "string" &&
      value.startsWith("#/definitions/")
        ? value.replace("#/definitions/", `#/components/schemas/${prefix}`)
        : value,
    ),
  ) as { definitions: Record<string, SchemaObject> } & SchemaObject;
  const { definitions, ...root } = normalized;
  for (const [name, definition] of Object.entries(definitions))
    recursiveSchemas[`${prefix}${name}`] = definition;
  return root;
}

export function ZodRequest(
  source: "body" | "query" | "params",
  schema: z.ZodType,
  onInvalid?: typeof invalidRequest,
): ParameterDecorator {
  const pipe = new ZodRoutePipe(schema, onInvalid);
  const binding =
    source === "body"
      ? Body(pipe)
      : source === "query"
        ? Query(pipe)
        : Param(pipe);
  const document = openApiSchema(schema, "input");

  return (target, key, index) => {
    if (key === undefined) throw new Error("ZodRequest 只能用于路由参数");
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (!descriptor) throw new Error("找不到路由方法");
    binding(target, key, index);
    if (source === "body") {
      ApiBody({ schema: document, required: true })(target, key, descriptor);
      return;
    }
    if (!document.properties) {
      throw new Error("query 和 params 的 Zod schema 必须是对象");
    }
    for (const [name, property] of Object.entries(document.properties)) {
      const decorator =
        source === "params"
          ? ApiParam({ name, required: true, schema: property as SchemaObject })
          : ApiQuery({
              name,
              required: document.required?.includes(name) ?? false,
              schema: property,
            });
      decorator(target, key, descriptor);
    }
  };
}

export function ApiZodResponse(
  status: number,
  schema: z.ZodType,
  description: string,
) {
  return ApiResponse({
    status,
    schema: openApiSchema(schema, "output"),
    description,
  });
}
