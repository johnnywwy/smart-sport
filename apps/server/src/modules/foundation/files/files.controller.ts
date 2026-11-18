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
  fileParamsSchema,
  fileUploadFieldsSchema,
  storedFileSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
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

/** 仅本人身份的暂存文件，身份级登录可用，业务导入仍需自己的功能权限。 */
@Controller("api/v1/files")
@UseGuards(FileBoundaryGuard)
export class FilesController {
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
    "上传Excel导入暂存文件",
  )
  upload(
    @Body(new ZodRoutePipe(fileUploadFieldsSchema)) _fields: {
      purpose: "import";
    },
    @UploadedFile() file: UploadFile | undefined,
  ) {
    return this.service.upload(
      this.cls.get<IdentityContext>("identityContext"),
      null,
      file,
    );
  }
  @Header("Cache-Control", "no-store")
  @Get(":id/url")
  @ApiZodResponse(
    200,
    successResponseSchema(fileDownloadSchema),
    "签发本人文件临时下载链接",
  )
  download(@ZodRequest("params", fileParamsSchema) params: { id: string }) {
    return this.service.download(
      this.cls.get<IdentityContext>("identityContext"),
      null,
      params.id,
    );
  }
}
