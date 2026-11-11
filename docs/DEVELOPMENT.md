# 本地开发

从 `docs/TASKS.md` 的 S-01 开始。当前交付工程与 Web UI 接入基础，不代表 S-01 或 M1 已验收；后端依赖、最小 ESM 入口及共享配置校验已建立；本地基础设施见 `docs/LOCAL_INFRA.md`，业务数据库访问、认证、业务队列消费者、权限与业务接口尚未实现。界面预览中的统计为示例数据。

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

`check:backend-deps` 验证各包运行时依赖导入、Nest ESM 上下文、argon2id 哈希验证及 jose EdDSA 签名验签；不会连接数据库或 Redis。BullMQ worker 的本地运行方式见 `docs/LOCAL_INFRA.md`。

`nestjs-zod` 当前发布版的 peer 范围未覆盖 NestJS 12，故未安装；T-014 后续用 Zod 4 接入验证与 OpenAPI。P1 的 OpenTelemetry / @nestjs/observe 暂不安装。

依赖安装后已继续实施 T-003 开发环境与 T-004 配置校验，使用方式见 `docs/LOCAL_INFRA.md`；T-010 健康接口与 T-018 测试队列消费者已可用。安装器报告的可选原生加速与遥测脚本未统一放开；argon2 的必需构建已执行并验证。

## 身份上下文缓存（T-028）

`IdentityContextService.load(identityId, client)` 加载身份、组织、账号状态和启用角色，把每个权限码对应的数据范围分别合并，返回的 `permissions` 为 Map。Redis 使用 `ctx:{identityId}` 保存可序列化副本，有效期 600 秒。

迁移 `0022` 为账号、身份、身份角色、角色档位、组织及应用目录的变更维护事务内数据库版本。加载上下文前后都核对数据库和 Redis 失效版本，避免并发变更期间返回旧权限；Redis Lua 脚本拒绝旧版本回填。实例通过 `ctx:invalidate` 广播清理过期版本，清理使用 SCAN 和原子 UNLINK，不使用 KEYS。

当前采用保守的全局版本：上述表的写入都会让已有上下文失效，包括账号资料和最近身份更新。缓存命中仍需查询数据库版本，优先保证权限变更立即可见。后续实现部门（T-033）时，也必须把部门调整纳入版本更新或在提交后调用 `invalidate`。本任务只提供内部服务，T-029 负责接入鉴权和 CLS，T-043 负责执行权限拦截。

## 全局身份鉴权（T-029）

`AuthenticatedGuard` 以全局守卫装配，接口默认要求身份级 access token。登录、刷新、退出及健康检查显式标记 `PublicRoute`；列身份、选择身份及改密标记 `AccountAllowed`。刷新和退出继续由各自服务校验 refresh Cookie，改密保留 access 与 Cookie 的双重校验。

鉴权通过注入接口调用 `AuthContextService`，不让 core 反向依赖业务模块。每次请求核对数据库中的会话归属、到期及吊销状态、账号状态和 tokenVersion，身份级请求还要求令牌身份与会话当前身份一致，否则返回 401 / 11005。验证后的身份上下文及 userId、sessionId、identityId 写入 CLS；`identityContext.permissions` 保持 Map。

Redis 的 `session:{sessionId}` 保存不含 refresh 哈希的会话摘要，TTL 不超过 600 秒及会话剩余有效期。它只作共享快照，不能作为跳过数据库校验的凭据，以保证退出、改密和跨标签页切换立即生效。权限动作的检查由后续 T-043 接入。

## 功能权限守卫（T-043）

`PermissionGuard` 在全局身份鉴权之后执行。业务方法使用 `@RequirePermissions("platform:org:view")` 声明所需权限，参数只能引用 contracts 已声明的权限码。多个参数为且关系；控制器与方法的声明累加，方法不能取消控制器要求。缺少已验证的身份上下文或任意一项权限时，返回 403 / 11101。

组织列表、新建、修改、启停已分别接入 view、create、update 权限，并保留公司身份限制。区划查询按 spec 03 保持登录后可用。全局功能未声明功能权限时仍由身份鉴权保护。此守卫只检查动作是否获授，不扩大每项权限的数据范围；后续涉及具体业务记录的接口仍需按该动作的范围校验目标记录。
