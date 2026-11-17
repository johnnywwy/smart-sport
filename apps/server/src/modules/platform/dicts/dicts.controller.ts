import type { IncomingMessage } from "node:http";
import {
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  type CreateDictItem,
  createDictItemSchema,
  type DictItemQuery,
  type DictTypeCode,
  deleteDictItemSchema,
  dictEmptyQuerySchema,
  dictItemListSchema,
  dictItemParamsSchema,
  dictItemQuerySchema,
  dictItemSchema,
  dictOptionsSchema,
  dictTypeParamsSchema,
  dictTypesSchema,
  successResponseSchema,
  type UpdateDictItem,
  updateDictItemSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { z } from "zod";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { DictsService } from "./dicts.service.js";
@Controller("api/v1")
export class DictsController {
  constructor(
    @Inject(DictsService) private readonly service: DictsService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  // 全局登录功能，AuthenticatedGuard 仍要求有效身份级令牌。
  @Get("dicts/:typeCode")
  @ApiZodResponse(
    200,
    successResponseSchema(dictOptionsSchema),
    "启用的字典选项",
  )
  options(
    @ZodRequest("params", dictTypeParamsSchema) params: {
      typeCode: DictTypeCode;
    },
    @ZodRequest("query", dictEmptyQuerySchema) _query: unknown,
  ) {
    return this.service.options(params.typeCode);
  }
  @Get("dict-types")
  @RequirePermissions("system:dict:view")
  @ApiZodResponse(
    200,
    successResponseSchema(dictTypesSchema),
    "字典目录与新增能力",
  )
  types(@ZodRequest("query", dictEmptyQuerySchema) _query: unknown) {
    return this.service.types(this.actor());
  }
  @Get("dict-types/:typeCode/items")
  @RequirePermissions("system:dict:view")
  @ApiZodResponse(
    200,
    successResponseSchema(dictItemListSchema),
    "字典选项管理列表",
  )
  list(
    @ZodRequest("params", dictTypeParamsSchema) params: {
      typeCode: DictTypeCode;
    },
    @ZodRequest("query", dictItemQuerySchema) query: DictItemQuery,
  ) {
    return this.service.list(params.typeCode, query, this.actor());
  }
  @Post("dict-types/:typeCode/items")
  @RequirePermissions("system:dict:create")
  @Idempotent(
    "dict.item.create",
    (context) =>
      context.switchToHttp().getRequest<{ auth: { identityId: string } }>().auth
        .identityId,
  )
  @ApiZodResponse(201, successResponseSchema(dictItemSchema), "新增自定义选项")
  create(
    @ZodRequest("params", dictTypeParamsSchema) params: {
      typeCode: DictTypeCode;
    },
    @ZodRequest("body", createDictItemSchema) input: CreateDictItem,
    @Req() request: IncomingMessage,
  ) {
    return this.service.create(
      params.typeCode,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Patch("dict-items/:id")
  @RequirePermissions("system:dict:update")
  @ApiZodResponse(200, successResponseSchema(dictItemSchema), "修改自定义选项")
  update(
    @ZodRequest("params", dictItemParamsSchema) params: { id: string },
    @ZodRequest("body", updateDictItemSchema) input: UpdateDictItem,
    @Req() request: IncomingMessage,
  ) {
    return this.service.update(
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Delete("dict-items/:id")
  @RequirePermissions("system:dict:delete")
  @ApiZodResponse(
    200,
    successResponseSchema(z.null()),
    "软删除尚未使用的自定义选项",
  )
  remove(
    @ZodRequest("params", dictItemParamsSchema) params: { id: string },
    @ZodRequest("body", deleteDictItemSchema) input: { version: number },
    @Req() request: IncomingMessage,
  ) {
    return this.service.remove(
      params.id,
      input.version,
      this.actor(),
      this.metadata(request),
    );
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
  private metadata(request: IncomingMessage) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}
