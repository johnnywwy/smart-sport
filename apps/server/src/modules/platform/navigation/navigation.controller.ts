import { Controller, Get, Inject } from "@nestjs/common";
import {
  availableAppsSchema,
  type CurrentMenusQuery,
  currentMenusQuerySchema,
  currentMenusSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import { NavigationService } from "./navigation.service.js";

@Controller("api/v1")
export class NavigationController {
  constructor(
    @Inject(NavigationService) private readonly navigation: NavigationService,
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

  @Get("menus/current")
  @ApiZodResponse(
    200,
    successResponseSchema(currentMenusSchema),
    "当前应用的可见菜单树",
  )
  current(
    @ZodRequest("query", currentMenusQuerySchema) query: CurrentMenusQuery,
  ) {
    return this.navigation.current(query);
  }
}
