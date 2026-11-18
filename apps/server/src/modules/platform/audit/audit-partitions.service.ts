import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AuditPartitionsRepository } from "./audit-partitions.repository.js";

@Injectable()
export class AuditPartitionsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> | undefined;
  private readonly logger = new Logger(AuditPartitionsService.name);
  constructor(
    @Inject(AuditPartitionsRepository)
    private readonly repository: AuditPartitionsRepository,
  ) {}

  /** 启动时和每日准备当前及未来两个月，同时归档兜底分区中的已有月份。 */
  async onApplicationBootstrap() {
    await this.prepare();
    this.timer = setInterval(
      () => {
        void this.prepare().catch(() =>
          this.logger.error(
            "审计月分区维护失败，日志继续写入兜底分区，次日重试",
          ),
        );
      },
      24 * 60 * 60 * 1000,
    );
    this.timer.unref();
  }
  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.pending;
  }
  private prepare() {
    this.pending ??= this.repository.prepare().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
}
