import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { loadConfig, loadDatabaseConfig } from "@smart-sport/config/env";
import { ClsModule, ClsService } from "nestjs-cls";
import { Logger, LoggerModule } from "nestjs-pino";

import { DataSourceRegistry, DRIZZLE } from "./database/registry.js";
import { HealthController, SERVER_CONFIG } from "./health.js";

import { requestContextMiddleware } from "./request-context.js";

const config = loadConfig("server");
const databaseConfig = loadDatabaseConfig();

@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        customProps: (request) => ({ traceId: request.id }),
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
      },
    }),
  ],
  controllers: [HealthController],
  providers: [
    { provide: SERVER_CONFIG, useValue: config },
    {
      provide: DataSourceRegistry,
      useFactory: () => new DataSourceRegistry(databaseConfig),
    },
    {
      provide: DRIZZLE,
      inject: [DataSourceRegistry],
      useFactory: (registry: DataSourceRegistry) => registry.get().db,
    },
  ],
})
class ServerModule {}

const app = await NestFactory.create(ServerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.use(requestContextMiddleware(app.get(ClsService)));
app.enableShutdownHooks();
await app.listen(config.PORT, config.HOST);
