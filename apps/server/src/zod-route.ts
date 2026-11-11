import { Body, Param, type PipeTransform, Query } from "@nestjs/common";
import {
  ApiBody,
  ApiParam,
  type ApiParamOptions,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";

type SchemaObject = Extract<ApiParamOptions, { schema: unknown }>["schema"];

import { z } from "zod";
import { invalidRequest } from "./api-response.js";

export class ZodRoutePipe implements PipeTransform {
  constructor(private readonly schema: z.ZodType) {}

  async transform(value: unknown) {
    const result = await this.schema.safeParseAsync(value);
    if (!result.success) throw invalidRequest(result.error.issues);
    return result.data;
  }
}

function openApiSchema(
  schema: z.ZodType,
  io: "input" | "output",
): SchemaObject {
  const { $schema: _dialect, ...document } = z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io,
    cycles: "throw",
  });
  return document as SchemaObject;
}

export function ZodRequest(
  source: "body" | "query" | "params",
  schema: z.ZodType,
): ParameterDecorator {
  const pipe = new ZodRoutePipe(schema);
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
