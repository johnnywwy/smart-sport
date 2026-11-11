/** 美化仅用于开发；测试和生产保留可采集的结构化 JSON。 */
export function createLoggerOptions(
  environment: "development" | "test" | "production",
  service: string,
  colorize = false,
) {
  return {
    name: service,
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
    ],
    ...(environment === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize,
              translateTime: "SYS:HH:MM:ss.l",
              singleLine: true,
              // 请求摘要已包含方法、路径、状态码、耗时；保留 traceId 和错误堆栈。
              ignore: "pid,hostname,req,res,responseTime",
            },
          },
        }
      : {}),
  };
}
