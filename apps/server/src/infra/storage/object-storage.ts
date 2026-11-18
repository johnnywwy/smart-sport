import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import { SERVER_CONFIG } from "../../server-config.js";

@Injectable()
export class ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      maxAttempts: 2,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      requestHandler: { connectionTimeout: 2000, requestTimeout: 10000 },
    });
  }
  /** 专用桶缺失时创建；已有访问策略不能假定为私有，拒绝静默暴露原始文件。 */
  async onModuleInit() {
    try {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "$metadata" in error &&
            (error.$metadata as { httpStatusCode?: number }).httpStatusCode ===
              404
          )
        )
          throw error;
        try {
          await this.client.send(
            new CreateBucketCommand({ Bucket: this.bucket }),
          );
        } catch (race) {
          if (
            !(race instanceof Error && race.name === "BucketAlreadyOwnedByYou")
          )
            throw race;
        }
      }
      try {
        const policy = await this.client.send(
          new GetBucketPolicyCommand({ Bucket: this.bucket }),
        );
        if (policy.Policy) throw new Error("文件存储桶必须使用私有访问策略");
      } catch (error) {
        if (!(error instanceof Error && error.name === "NoSuchBucketPolicy"))
          throw error;
      }
    } catch {
      throw new ServiceUnavailableException("文件存储桶不可用或并非私有桶");
    }
  }
  onApplicationShutdown() {
    this.client.destroy();
  }
  /** 对象只使用服务器生成的键，不在日志中打印签名URL或凭据。 */
  async put(key: string, buffer: Buffer, contentType: string, sha256: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
          Metadata: { sha256 },
          IfNoneMatch: "*",
        }),
      );
    } catch {
      throw new ServiceUnavailableException("文件存储暂不可用");
    }
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
  async download(
    key: string,
    filename: string,
    seconds: number,
    signingDate: Date,
  ) {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: seconds, signingDate },
      );
    } catch {
      throw new ServiceUnavailableException("文件存储暂不可用");
    }
  }
}
