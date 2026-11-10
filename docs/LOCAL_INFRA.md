# 本地基础设施与环境配置（T-003 / T-004）

## 启动

要求 Node.js 24+、pnpm 10.34.9、Docker 引擎与支持 `include` 的 Docker Compose（2.20+）。先启动 Docker Desktop / OrbStack，再在仓库根目录执行：

```sh
pnpm env:init
pnpm infra:up
pnpm infra:status
pnpm infra:check
```

`env:init` 根据 `.env.example` 生成 `.env`，数据库、Redis、MinIO 密码、字段加密/HMAC 密钥和 Ed25519 私钥均随机生成。文件权限为 0600，已被 Git 忽略；文件已存在时不会覆盖。不要删除 `.env` 后重新生成并继续使用原有数据卷，否则数据库凭据与加密密钥可能不匹配。

`infra:up` 等价于 `docker compose up -d --wait`。根目录 `compose.yaml` 引入 `deploy/compose.dev.yaml`。服务仅发布到 `127.0.0.1`：

| 服务       | 固定版本                     | 本机端口                     | 数据卷            |
| ---------- | ---------------------------- | ---------------------------- | ----------------- |
| PostgreSQL | 17.11-alpine3.23             | 15432                        | postgres-data     |
| Redis      | 8.10.3-alpine3.23            | 16379                        | redis-data（AOF） |
| MinIO      | RELEASE.2025-10-15T17-29-55Z | 19000（S3）、19001（控制台） | minio-data        |

卷名由 Compose 项目 `smart-sport-dev` 隔离。`pnpm infra:down` 停止并移除容器、保留数据卷；不会运行 `down -v`。修改端口时需同步 `.env` 中的 DATABASE_URL、REDIS_URL 或 S3_ENDPOINT。

### MinIO 构建

验证时，Docker Hub 的 MinIO 镜像拒绝访问，所选 Quay 标签不存在，官方二进制下载地址返回 410。因此使用 `deploy/minio/Dockerfile` 从 [官方固定发布源码](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) 构建：下载内容用 SHA-256 校验，固定 Go/Alpine 版本，保留许可证，以非 root 用户运行。首次启动需要联网下载 Go 模块并编译，后续使用本地构建缓存。升级需另行验证；本配置仅面向开发，不代表生产发布基线。

### 联通检查

`pnpm infra:check` 使用应用配置执行 PostgreSQL 鉴权查询、Redis 写入读取和 MinIO S3 上传下载。检查使用唯一临时键和临时存储桶，结束后清理；Redis 临时键还带过期时间。不会创建业务表或正式业务存储桶。production 环境禁止运行此检查。

## 后端启动

```sh
pnpm build
pnpm --filter @smart-sport/server start
# 另一个终端：worker 仍是最小入口，消费者将在 T-018 实现
pnpm --filter @smart-sport/worker start
```

两个入口先加载 `@smart-sport/config/env` 校验，再创建 Nest 应用。`start` 自动加载根目录 `.env`（存在时），已注入的环境变量优先；直接执行构建产物时由运行环境提供变量。server 默认监听 `127.0.0.1:3000`，尚无健康检查和业务路由，访问 `/` 返回 404 是当前正常行为。

## 配置契约

| 配置                                   | 适用范围        | 要求                                       |
| -------------------------------------- | --------------- | ------------------------------------------ |
| NODE_ENV                               | server / worker | 必填，development、test、production        |
| DATABASE_URL                           | server / worker | 必填，postgres / postgresql URL            |
| REDIS_URL                              | server / worker | 必填，redis / rediss URL                   |
| S3_ENDPOINT                            | server / worker | 必填，HTTP(S) URL                          |
| S3_REGION、S3_BUCKET、S3_ACCESS_KEY_ID | server / worker | 必填；bucket 校验基础命名格式              |
| S3_SECRET_ACCESS_KEY                   | server / worker | 必填，至少 16 字符                         |
| FIELD_ENCRYPTION_KEY、STUDENT_HMAC_KEY | server / worker | 必填，32 字节密钥的 Base64 编码            |
| JWT_PRIVATE_KEY                        | server          | 必填，Ed25519 PKCS8 DER 私钥的 Base64 编码 |
| JWT_KEY_ID                             | server          | 必填，用于后续 JWT 的 kid                  |
| HOST、PORT                             | server          | 默认 127.0.0.1、3000；端口范围 1–65535     |

`.env.example` 中的 POSTGRES_*、REDIS_PASSWORD、MINIO_* 为 Compose 开发服务配置；应用使用 URL/S3 配置。生产使用部署环境注入，不使用本地生成脚本作为密钥管理工具。

无效配置仅报告变量名，不打印密钥、连接串或 Zod 原始输入。解析结果不可变，未知变量不进入配置对象。production 下 `apiDocsEnabled` 和 `demoSeedEnabled` 强制为 false，后续 API 文档与初始化功能必须消费这些开关；当前不实现密码策略或种子账号（T-024 / T-140）。

## 验证

```sh
pnpm test:config
pnpm test:config-startup
pnpm lint
pnpm typecheck
pnpm build
```

配置测试覆盖三种环境、缺失项、非法 URL/端口/密钥及错误日志脱敏。启动测试逐个移除 server / worker 的必填变量，直接执行编译后的真实入口，要求进程非零退出并指出缺失变量。

T-003 / T-004 不包括 T-010 健康接口、T-011 迁移、T-018 消费者或 T-181 生产部署。
