import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger, LoggerModule } from "nestjs-pino";
import { z } from "zod";

// 安装验证用的最小入口；配置、健康检查与业务路由在 T-004/T-010 中实现。
@Module({ imports: [LoggerModule.forRoot()] })
class ServerModule {}

const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .default(3000)
  .parse(process.env.PORT);
const app = await NestFactory.create(ServerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
await app.listen(port, "127.0.0.1");
