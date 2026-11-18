# 智慧体育云平台

面向学校体育的云平台。公司、教育局、代理商、学校、教师（以后还有学生和家长）用同一套系统，一个人一个账号，可以同时有多个身份，登录后选择以哪个身份进入。每所学校的数据单独存放，归学校所有。

当前在做 **地基 M1：Web 后台管理**。它是以后跳绳、跑步、体测、赛事、中考体育、数据大屏等业务共用的基础。

## 谁在用

| 组织                               | 能做什么                                 | 能看到哪些学校                   |
| ---------------------------------- | ---------------------------------------- | -------------------------------- |
| 公司（研发、销售、生产、技术服务） | 开通学校、管理平台设置、角色模板         | 全部，按所在部门的负责范围收窄   |
| 教育局（省、市、区县）             | 查看辖区学校                             | 辖区内的学校                     |
| 代理商                             | 协助学校运营                             | 学校授权给它的学校，授权有到期日 |
| 学校管理员                         | 管本校的班级、学生、教师、学年升级、转学 | 本校，可按年级或学院收窄         |
| 教师                               | 管自己的班                               | 本人任教的班级                   |
| 学生、家长（M2）                   | 手机上看任务和成绩                       | 本人、已绑定的孩子               |

一句话：**部门决定看哪些数据，角色决定能做什么。**

## 里程碑

| 里程碑    | 内容                                                                                                       | 状态   |
| --------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| M1 地基   | 账号与身份、组织与部门、角色权限、数据范围、学校库、学年学期、班级学生教师、导入导出、任务、审计、后台外壳 | 进行中 |
| M2 移动端 | 学生、教师、家长 H5，学生登录，家长绑定孩子（[spec 17](docs/spec/17-mobile-h5.md)）                        | 设计中 |
| M3 业务   | 跳绳、跑步等运动应用；赛事；中考体育                                                                       | 未开始 |
| M4 分析   | BI 大屏、跨校汇总                                                                                          | 未开始 |

M1 已经能用的部分（有的任务只完成了一部分，以 PROGRESS 为准）：登录与改密、选择组织、选择模块与模块工作区、组织与部门、成员与角色、角色模板、数据范围与“实际可见”、学校档案、学年学期、字典、编号规则、系统参数、行政区划、菜单设置、文件暂存、任务中心后端、操作记录。

数据库版本统一（T-185）已完成。下一步：集成测试进 CI（T-186），然后做学校库地基（切片 S-11A）。逐任务的进度见 [PROGRESS.md](docs/PROGRESS.md)。

## 整体架构

```
浏览器（Web 后台；M2 起有手机 H5）
        │
      Nginx    静态资源、/api 反向代理、安全响应头
        │
  NestJS API   鉴权 → 权限 → 学校访问 → 参数校验 → 业务 → 审计
   │      │
   │    worker（BullMQ）  学校开通、学校库迁移、导入导出、学年切换、消息投递
   │      │
PostgreSQL ── public：账号、组织、权限、学年等平台数据
           └─ school_<32 位十六进制> × N：每所学校一个 schema
Redis（缓存、限流、队列）   MinIO（文件）
```

几个关键设计（理由见 [ARCHITECTURE.md](docs/ARCHITECTURE.md) 第 6 节）：

- **一校一 schema**：学校数据可以整体导出、迁移、销毁。访问学校数据只能通过 `TenantService.forSchool(schoolId)`，不切换 `search_path`。
- **两阶段令牌**：登录先拿账号级令牌，选择身份后才拿到能调业务接口的身份级令牌。令牌只带最少信息，权限在服务端算，改角色立即生效。
- **权限按“功能模块 × 档位 × 动作”配置**：管理员不用懂权限码。数据范围按每个权限码分别计算，避免多角色合并时放大权限。
- **契约先行**：接口的请求、响应、错误码都在 `packages/contracts` 里用 Zod 定义，前后端共用。
- **菜单和权限以代码为准**：部署时同步到数据库，后台只能改名称、排序、图标、显隐。

## 技术栈

| 层   | 选型                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 工程 | Node.js 24+、pnpm 10、Turborepo、TypeScript strict、全部 ESM、Biome 2                                     |
| 后端 | NestJS 12、Zod 4、Drizzle ORM、nestjs-cls、jose（EdDSA JWT）、argon2id、BullMQ、pino                      |
| 前端 | React 19、Vite 7、HeroUI 3 + HeroUI Pro、Tailwind CSS 4、React Router 7、TanStack Query 5、zustand 5、MSW |
| 数据 | PostgreSQL 18.6、Redis 8、MinIO                                                                           |
| 测试 | Vitest、Testcontainers（真实 PostgreSQL 和 Redis）、Playwright                                            |

## 仓库结构

```
apps/
  server/     NestJS API；migrations/ 下是手写 SQL 迁移
  worker/     BullMQ 后台任务
  web/        Web 后台
packages/
  contracts/  接口契约、权限码、模块与菜单声明、错误码
  domain/     纯函数：年级计算、权限匹配、数据范围合并
  config/     环境变量校验
deploy/       本地开发编排、服务器部署脚本、行政区划数据
scripts/      工程检查脚本（UI 控件、依赖方向）
docs/         架构说明、规格、任务、进度
```

## 本地运行

要求 Node.js 24+、pnpm 10.34.9、Docker（Compose 2.20+）。

```sh
pnpm install --frozen-lockfile
pnpm setup:hero        # 需要环境变量 HEROUI_KEY
pnpm env:init          # 生成 .env，密码和密钥随机生成
pnpm infra:up          # 启动 PostgreSQL、Redis、MinIO
pnpm db:migrate
pnpm build
pnpm --filter @smart-sport/server start
```

另开终端启动前端和 worker：

```sh
pnpm dev
# 再开一个终端；涉及异步任务时需要 worker
pnpm --filter @smart-sport/worker start
```

开发和测试环境的默认密码是 `123456`，生产环境禁止使用。详细步骤见 [DEVELOPMENT.md](docs/DEVELOPMENT.md) 和 [LOCAL_INFRA.md](docs/LOCAL_INFRA.md)。

常用检查：

```sh
pnpm lint              # Biome 和 HeroUI 控件约束
pnpm check:deps        # 依赖方向
pnpm typecheck
pnpm test:unit
pnpm --filter @smart-sport/server test:integration   # 需要 Docker；CI 里还没跑
pnpm build
```

## 文档

| 文档                                                   | 内容                                             |
| ------------------------------------------------------ | ------------------------------------------------ |
| [AGENTS.md](AGENTS.md)                                 | 开发指南：工作方式、不能破的规则、提交与汇报格式 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)           | 系统怎么组织、关键决策为什么这样定               |
| [docs/spec/](docs/spec/)                               | 按功能拆分的 18 份规格，与代码冲突时以规格为准   |
| [docs/TASKS.md](docs/TASKS.md)                         | 任务清单、功能切片、推进顺序                     |
| [docs/PROGRESS.md](docs/PROGRESS.md)                   | 每个任务的实施和验收记录                         |
| [docs/REVIEW_2026-11-18.md](docs/REVIEW_2026-11-18.md) | 架构检查结论和待确认问题                         |

提交用 `pnpm commit`（git cz），格式 `type(scope): 说明`，正文最后一行写 `Refs: T-xxx`。
