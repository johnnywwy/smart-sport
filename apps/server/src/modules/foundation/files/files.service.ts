import { Inject, Injectable, Logger } from "@nestjs/common";
import { fileDownloadSchema, storedFileSchema } from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import { ObjectStorage } from "../../../infra/storage/object-storage.js";
import type { IdentityContext } from "../../platform/identity-context/index.js";
import { type UploadFile, validateExcelFile } from "./excel-file.js";
import { FileAccessService } from "./file-access.service.js";
import { FilesRepository } from "./files.repository.js";

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    @Inject(FilesRepository) private readonly repository: FilesRepository,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(FileAccessService) private readonly access: FileAccessService,
  ) {}
  /** 先校验再写私有对象；存储和元数据失败采用补偿，绝不返回失败对象的链接。 */
  async upload(
    actor: IdentityContext,
    schoolId: string | null,
    file: UploadFile | undefined,
  ) {
    const { context, revision } = await this.access.snapshot(actor, schoolId);
    const { buffer, ...metadata } = await validateExcelFile(file);
    const now = new Date();
    const id = v7();
    const [year, month] = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
    })
      .format(now)
      .split("-");
    const objectKey = `${schoolId?.toLowerCase() ?? "platform"}/${year}/${month}/${id}`;
    await this.access.current(revision);
    let created = false;
    try {
      await this.storage.put(
        objectKey,
        buffer,
        metadata.contentType,
        metadata.sha256,
      );
      await this.access.current(revision);
      const row = await this.repository.create({
        ...metadata,
        id,
        objectKey,
        identityId: context.identityId,
        orgId: context.orgId,
        schoolId: schoolId?.toLowerCase() ?? null,
        purpose: "import",
        createdAt: now,
        updatedAt: now,
        createdBy: context.identityId,
        updatedBy: context.identityId,
        expiresAt: new Date(now.getTime() + 86_400_000),
      });
      created = true;
      await this.access.current(revision);
      return storedFileSchema.parse({
        id: row.id,
        filename: row.filename,
        contentType: row.contentType,
        size: row.size,
        schoolId: row.schoolId,
        purpose: row.purpose,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        allowedActions: [],
      });
    } catch (error) {
      if (created) {
        try {
          await this.repository.abandon(id, context.identityId);
        } catch {
          this.logger.error("失败文件元数据待对账清理");
        }
      }
      try {
        await this.storage.remove(objectKey);
      } catch {
        this.logger.error("失败文件对象待对账清理");
      }
      throw error;
    }
  }
  /** 下载再次核对归属和有效期；签名有效期受文件剩余寿命约束。 */
  async download(actor: IdentityContext, schoolId: string | null, id: string) {
    const { context, revision } = await this.access.snapshot(actor, schoolId);
    const row = await this.repository.owned(
      id.toLowerCase(),
      context.identityId,
      context.orgId,
      schoolId?.toLowerCase() ?? null,
    );
    if (!row) throw new ApiException(90004);
    const now = Date.now();
    const seconds = Math.min(
      300,
      Math.floor((row.expiresAt.getTime() - now) / 1000),
    );
    if (seconds < 1) throw new ApiException(90004);
    const url = await this.storage.download(
      row.objectKey,
      row.filename,
      seconds,
      new Date(now),
    );
    await this.access.current(revision);
    return fileDownloadSchema.parse({
      url,
      expiresAt: new Date(now + seconds * 1000).toISOString(),
    });
  }
}
