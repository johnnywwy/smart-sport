# 后端开发日志

启动：构建后执行 `pnpm --filter @smart-sport/server start`。

`NODE_ENV=development` 时使用 pino-pretty；普通请求显示时间、级别、服务名、方法、路径、状态码、耗时和 traceId。4xx 使用 WARN，5xx 使用 ERROR，错误堆栈单独展开。支持颜色的终端会显示级别颜色。查询参数和请求头不出现在开发请求摘要中。

测试与生产环境输出 Pino JSON，不加载 pino-pretty。认证头与 Cookie 的脱敏策略继续生效。worker 使用相同环境策略。修改日志配置后需要重启已有后端进程。

参考：[pino-pretty 官方说明](https://github.com/pinojs/pino-pretty)。
