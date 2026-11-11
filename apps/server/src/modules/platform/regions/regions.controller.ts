import { Controller, Get, Inject } from "@nestjs/common";
import {
  type RegionQuery,
  regionListSchema,
  regionQuerySchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import { RegionsService } from "./regions.service.js";

@Controller("api/v1/regions")
export class RegionsController {
  constructor(
    @Inject(RegionsService) private readonly regions: RegionsService,
  ) {}

  @Get()
  @ApiZodResponse(200, successResponseSchema(regionListSchema), "按级加载区划")
  list(@ZodRequest("query", regionQuerySchema) query: RegionQuery) {
    return this.regions.list(query);
  }
}
