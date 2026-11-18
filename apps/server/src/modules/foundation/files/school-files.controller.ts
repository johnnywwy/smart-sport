import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBody, ApiConsumes } from "@nestjs/swagger";
import {
  fileDownloadSchema,
  fileUploadFieldsSchema,
  schoolFileParamsSchema,
  schoolFileUploadParamsSchema,
  storedFileSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { SchoolScoped } from "../../../core/school-scoped.js";
import { Idempotent } from "../../../idempotency.js";
import {
  ApiZodResponse,
  ZodRequest,
  ZodRoutePipe,
} from "../../../zod-route.js";
import type { IdentityContext } from "../../platform/identity-context/index.js";
import type { UploadFile } from "./excel-file.js";
import { FileBoundaryGuard } from "./file-boundary.guard.js";
import {
  excelUploadInterceptor,
  fileMultipartBody,
  fileUploadScope,
} from "./file-upload.js";
import { FilesService } from "./files.service.js";
@Controller("api/v1/schools/:schoolId/files")
@SchoolScoped()
@UseGuards(FileBoundaryGuard)
export class SchoolFilesController {
  constructor(
    @Inject(FilesService) private readonly service: FilesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Header("Cache-Control", "no-store")
  @Post()
  @Idempotent("files.upload", fileUploadScope)
  @UseInterceptors(excelUploadInterceptor)
  @ApiConsumes("multipart/form-data")
  @ApiBody(fileMultipartBody)
  @ApiZodResponse(
    201,
    successResponseSchema(storedFileSchema),
    "上传本校个人Excel暂存文件",
  )
  upload(
    @ZodRequest("params", schoolFileUploadParamsSchema) params: {
      schoolId: string;
    },
    @Body(new ZodRoutePipe(fileUploadFieldsSchema)) _fields: {
      purpose: "import";
    },
    @UploadedFile() file: UploadFile | undefined,
  ) {
    return this.service.upload(
      this.cls.get<IdentityContext>("identityContext"),
      params.schoolId,
      file,
    );
  }
  @Header("Cache-Control", "no-store")
  @Get(":id/url")
  @ApiZodResponse(
    200,
    successResponseSchema(fileDownloadSchema),
    "签发本校本人文件下载链接",
  )
  download(
    @ZodRequest("params", schoolFileParamsSchema) params: {
      schoolId: string;
      id: string;
    },
  ) {
    return this.service.download(
      this.cls.get<IdentityContext>("identityContext"),
      params.schoolId,
      params.id,
    );
  }
}
