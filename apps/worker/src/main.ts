import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig } from "@smart-sport/config/env";
import { QueueWorker, WORKER_CONFIG } from "./queue-worker.js";

const config = loadConfig("worker");

@Module({
  providers: [QueueWorker, { provide: WORKER_CONFIG, useValue: config }],
})
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();

try {
  await app.get(QueueWorker).start();
} catch {
  console.error("worker 启动失败，请检查 Redis 与 BullMQ 配置");
  process.exitCode = 1;
  await app.close();
}
