import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig } from "@smart-sport/config/env";
import { Logger, LoggerModule } from "nestjs-pino";

const config = loadConfig("server");

// 安装验证用的最小入口；健康检查与业务路由在 T-010 中实现。
@Module({ imports: [LoggerModule.forRoot()] })
class ServerModule {}

const app = await NestFactory.create(ServerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
await app.listen(config.PORT, config.HOST);
