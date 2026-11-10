import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig } from "@smart-sport/config/env";
import { Logger, LoggerModule } from "nestjs-pino";

import { HealthController, SERVER_CONFIG } from "./health.js";

const config = loadConfig("server");

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
      },
    }),
  ],
  controllers: [HealthController],
  providers: [{ provide: SERVER_CONFIG, useValue: config }],
})
class ServerModule {}

const app = await NestFactory.create(ServerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
await app.listen(config.PORT, config.HOST);
