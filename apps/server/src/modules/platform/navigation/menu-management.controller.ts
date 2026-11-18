import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import {
  type MenuOverrideQuery,
  menuOverrideListSchema,
  menuOverrideQuerySchema,
  menuOverridesSavedSchema,
  successResponseSchema,
  type UpdateMenuOverrides,
  updateMenuOverridesSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { MenuManagementService } from "./menu-management.service.js";
@Controller("api/v1/menus/overrides")
export class MenuManagementController {
  constructor(
    @Inject(MenuManagementService)
    private readonly service: MenuManagementService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("system:menu:view")
  @ApiZodResponse(
    200,
    successResponseSchema(menuOverrideListSchema),
    "按模块查询菜单显示设置",
  )
  list(@ZodRequest("query", menuOverrideQuerySchema) query: MenuOverrideQuery) {
    return this.service.list(
      query,
      this.cls.get<IdentityContext>("identityContext"),
    );
  }
  @Patch()
  @RequirePermissions("system:menu:update")
  @ApiZodResponse(
    200,
    successResponseSchema(menuOverridesSavedSchema),
    "原子保存菜单显示覆盖",
  )
  update(
    @ZodRequest("body", updateMenuOverridesSchema) input: UpdateMenuOverrides,
    @Req() request: IncomingMessage,
  ) {
    return this.service.update(
      input,
      this.cls.get<IdentityContext>("identityContext"),
      {
        traceId: this.cls.getId(),
        ip: request.socket.remoteAddress ?? "unknown",
        userAgent: request.headers["user-agent"] ?? "",
      },
    );
  }
}
