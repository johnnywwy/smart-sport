import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { loadConfig, loadDatabaseConfig } from "@smart-sport/config/env";
import { ClsModule, ClsService } from "nestjs-cls";
import { Logger, LoggerModule } from "nestjs-pino";

import { ApiExceptionFilter, ApiResponseInterceptor } from "./api-response.js";
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
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
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
if (config.apiDocsEnabled && config.NODE_ENV === "development") {
  const options = new DocumentBuilder()
    .setTitle("智慧体育云平台 API")
    .setVersion("1.0")
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    () => SwaggerModule.createDocument(app, options),
    {
      jsonDocumentUrl: "api/docs/openapi.json",
      raw: ["json"],
    },
  );
}
await app.listen(config.PORT, config.HOST);
