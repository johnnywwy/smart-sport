import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig } from "@smart-sport/config/env";

loadConfig("worker");

// 安装验证用的最小入口；队列连接与消费者在 T-018 中实现。
@Module({})
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
