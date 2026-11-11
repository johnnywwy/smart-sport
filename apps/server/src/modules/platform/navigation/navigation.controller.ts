import { Controller, Get, Inject } from "@nestjs/common";
import {
  availableAppsSchema,
  availableModulesSchema,
  currentMenusQuerySchema,
  currentMenusSchema,
  moduleMenusSchema,
  type NavigationMenusQuery,
  navigationMenusQuerySchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { z } from "zod";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import { ModuleNavigationService } from "./module-navigation.service.js";
import { NavigationService } from "./navigation.service.js";

@Controller("api/v1")
export class NavigationController {
  constructor(
    @Inject(NavigationService) private readonly navigation: NavigationService,
    @Inject(ModuleNavigationService)
    private readonly modules: ModuleNavigationService,
  ) {}

  @Get("apps/available")
  @ApiZodResponse(
    200,
    successResponseSchema(availableAppsSchema),
    "当前身份的可用应用",
  )
  available() {
    return this.navigation.available();
  }

  @Get("modules/available")
  @ApiZodResponse(
    200,
    successResponseSchema(availableModulesSchema),
    "当前身份可用模块",
  )
  availableModules() {
    return this.modules.available();
  }

  @Get("menus/current")
  @ApiZodResponse(
    200,
    successResponseSchema(z.union([moduleMenusSchema, currentMenusSchema])),
    "当前模块分组菜单；迁移期间兼容旧应用参数",
  )
  current(
    @ZodRequest("query", navigationMenusQuerySchema)
    query: NavigationMenusQuery,
  ) {
    return query.module !== undefined
      ? this.modules.current(query.module)
      : this.navigation.current(currentMenusQuerySchema.parse(query));
  }
}
