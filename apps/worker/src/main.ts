import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig, loadDatabaseConfig } from "@smart-sport/config/env";
import { QueueWorker, WORKER_CONFIG } from "./queue-worker.js";
import { SchoolProvisionWorker } from "./school-provision-worker.js";

const config = loadConfig("worker");
const database = loadDatabaseConfig();

@Module({
  providers: [
    QueueWorker,
    { provide: WORKER_CONFIG, useValue: config },
    {
      provide: SchoolProvisionWorker,
      useFactory: () => new SchoolProvisionWorker(config, database),
    },
  ],
})
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();

try {
  await app.get(QueueWorker).start();
  await app.get(SchoolProvisionWorker).start();
} catch {
  console.error("worker 启动失败，请检查 Redis 与 BullMQ 配置");
  process.exitCode = 1;
  await app.close();
}
