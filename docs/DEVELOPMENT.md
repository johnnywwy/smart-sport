# 本地开发

从 `docs/TASKS.md` 的 S-01 开始。当前交付工程与 Web UI 接入基础，不代表 S-01 或 M1 已验收；后端依赖及最小 ESM 入口已建立，认证、数据库连接、队列消费者、权限与业务接口尚未实现。界面预览中的统计为示例数据。

## 安装与运行

要求 Node.js 24+、pnpm 10.34.9。根目录执行：

```sh
pnpm install --frozen-lockfile
# HEROUI_KEY 由本地环境或 CI secret 注入，不写入文件或 VITE_* 变量。
pnpm setup:hero
pnpm dev
```

HeroUI React Pro 按用户指定的 [CollectUI Web 文档](https://docs.collectui.pro/zh/web/quick-start) 和 [hpsetup 用法](https://docs.collectui.pro/zh/hpsetup/usage) 安装。使用 `hpsetup@4.7.4 react --auto`，仅安装 Web 产品。该安装器会下载并恢复 Pro 的组件代码；仅安装 npm 包不足以完成 Pro 接入。未使用 MCP / Skills 服务，因此不需要 personal token。

`hpsetup` 会读取 `HEROUI_KEY`，使用用户目录下的缓存，并可能自动更新 Pro 版本与 peer 依赖。重新运行后必须审查 package.json 和锁文件变更；本仓库锁定本次验收的精确版本。不要把更新命令放进普通 postinstall。

```sh
pnpm lint
pnpm typecheck
pnpm build
```

## UI 约束

- 仅使用 HeroUI Web：`@heroui/react`、`@heroui/styles`、`@heroui-pro/react/*`。
- Pro 必须按子路径导入；全局样式按 Tailwind → HeroUI → Pro 顺序加载。
- 禁止 React Native / HeroUI Native 和其他组件库。禁止原生按钮、输入框、表格、弹窗等替代 HeroUI。非交互文本与布局可使用语义化 HTML。
- `pnpm lint` 包含基于 TypeScript AST 的控件检查，覆盖静态导入、原生 JSX 控件与原生标签点击事件；代码评审仍需检查动态导入等绕过方式。
- 当前页面是工程预览，不实现登录或伪造权限；后续按契约、Mock、真实接口顺序接入。

## 后端依赖（2026-11-10）

已创建 `apps/server`、`apps/worker`，依赖均锁定精确版本并纳入根目录锁文件：

| 用途             | 依赖                                               |
| ---------------- | -------------------------------------------------- |
| NestJS 12        | common、core、platform-express（server）、testing  |
| 契约与校验       | Zod 4（server、worker、contracts）                 |
| PostgreSQL       | Drizzle ORM、pg；server 配置 drizzle-kit 开发工具  |
| Redis / 队列     | ioredis、BullMQ、@nestjs/bullmq                    |
| 认证             | jose（EdDSA JWT）、argon2（argon2id）              |
| 请求上下文与日志 | nestjs-cls、nestjs-pino、pino-http、pino           |
| API 文档 / 限流  | @nestjs/swagger、@nestjs/throttler                 |
| MinIO S3         | @aws-sdk/client-s3、@aws-sdk/s3-request-presigner  |
| 邮件             | worker 的 nodemailer                               |
| ID               | uuid（支持 UUID v7）                               |
| 测试             | Vitest、Testcontainers、@testcontainers/postgresql |

Node 配置使用 `NodeNext` ESM、strict、装饰器元数据，与 Web 的 Bundler 配置分开。后端直接用 TypeScript 编译，不额外引入 Nest CLI。

```sh
pnpm install --frozen-lockfile
pnpm check:backend-deps
pnpm typecheck
pnpm build
# 可选：运行最小 API 入口，默认仅监听 127.0.0.1:3000
pnpm --filter @smart-sport/server start
```

`check:backend-deps` 验证各包运行时依赖导入、Nest ESM 上下文、argon2id 哈希验证及 jose EdDSA 签名验签；不会连接数据库或 Redis。worker 当前仅为可编译的应用上下文入口，尚未注册队列消费者。

`nestjs-zod` 当前发布版的 peer 范围未覆盖 NestJS 12，故未安装；T-014 后续用 Zod 4 接入验证与 OpenAPI。P1 的 OpenTelemetry / @nestjs/observe 暂不安装。

本次为应用依赖安装，不包含 PostgreSQL 17、Redis 8、MinIO 容器部署与服务联调；T-003、T-004、T-010、T-018 仍需按验收标准继续实现。安装器报告的可选原生加速与遥测脚本未统一放开；argon2 的必需构建已执行并验证。
