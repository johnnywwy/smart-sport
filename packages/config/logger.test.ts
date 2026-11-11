import { describe, expect, it } from "vitest";
import { createLoggerOptions } from "./src/logger.js";

describe("日志输出策略", () => {
  it("开发环境启用单行摘要，保留 traceId 与错误堆栈", () => {
    const options = createLoggerOptions("development", "server", true);
    expect(options.transport).toMatchObject({
      target: "pino-pretty",
      options: { colorize: true, singleLine: true },
    });
    expect(options.transport?.options.ignore).not.toContain("traceId");
    expect(options.transport?.options.ignore).not.toContain("err");
    expect(options.redact).toContain("req.headers.authorization");
    expect(options.redact).toContain("req.headers.cookie");
    expect(options.redact).toContain('res.headers["set-cookie"]');
  });
  it.each(["test", "production"] as const)(
    "%s 环境不加载开发日志依赖",
    (environment) => {
      expect(createLoggerOptions(environment, "server")).not.toHaveProperty(
        "transport",
      );
    },
  );
});
