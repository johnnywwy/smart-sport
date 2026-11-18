# 15 · 工程与部署

## 1. 仓库

- pnpm workspace + Turborepo；包：`apps/server`、`apps/worker`、`apps/web`、`packages/contracts`、`packages/domain`、`packages/config`。
- 全部 ESM；TypeScript strict；路径别名只在包内使用，跨包通过包名引用。
- Biome 2 负责 lint 与格式化。
- HeroUI Pro 为付费私有包：本地开发在用户级 `.npmrc` 配置令牌；CI 与 Docker 构建通过密钥注入（BuildKit secret），令牌不进代码库、不进镜像层；锁定精确版本。

### 当前 Web 安装方式

本项目按用户指定的 CollectUI 文档，使用 `hpsetup@4.7.4 react --auto` 下载 HeroUI React Pro。通过 `HEROUI_KEY` 环境变量注入密钥，不配置明文仓库凭据。安装步骤与当前交付边界见 `docs/DEVELOPMENT.md`。

## 2. 提交规范

- 统一用 `git cz`（commitizen + cz-git，中文交互）；commitlint 在 commit-msg 钩子校验；husky 管理钩子。
- 格式：`type(scope): 说明`，正文写“做了什么、为什么”，关联任务编号（如 `Refs: T-031`）。
- type：feat · fix · docs · style · refactor · perf · test · build · ci · chore · revert。
- scope：server · worker · web · contracts · domain · db · deploy · docs · 以及规格编号（如 `spec-05`）。
- 一个提交只做一件事（对应 TASKS 中的一个任务或其中一个可独立验证的部分）。
- pre-commit：对暂存文件运行 Biome；pre-push：类型检查 + 受影响包单测。

## 3. 前后端协作

- **契约先行**：每个接口先在 `packages/contracts` 写 Zod schema（请求、响应、错误码）和示例数据，单独提交（`feat(contracts): …`），评审通过后前后端并行开发。
- **前端 Mock**：MSW 根据契约与示例数据提供 Mock 接口；`VITE_MOCK` 可按接口前缀开关，后端就绪一个就切换一个。
- **联调规则**：前后端出现不一致时，只能通过修改契约解决，修改契约要同时通知两端。
- **切片完成定义**：后端集成测试通过、前端页面完成并接真实接口、切片 Playwright 冒烟通过、种子数据可演示、相关规格已更新（见 TASKS“前后端同步推进”）。
- **后端任务合并后的检查**：负责人检查对应切片的前端任务是否可以开始或从 Mock 切换到真实接口。

## 4. Drizzle 使用约定

Drizzle 中文资料较少，以下写法作为团队标准，新人照此编写。

| 场景       | 约定                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| 平台库查询 | 注入 `DRIZZLE`（默认数据源），表从 `schema/public.ts` 导入                                                |
| 学校库查询 | 只能通过 `const { db, t } = await tenant.forSchool(schoolId)`；禁止手写 schema 名，禁止 `SET search_path` |
| 数据范围   | 列表查询必须 `.where(and(条件, scopeFilter(t, 权限码)))`；代码评审时检查                                  |
| 事务       | `db.transaction(async (tx) => …)`；同数据源内跨 public 与学校库写入用同一个 tx；跨数据源写 outbox         |
| 乐观锁     | 更新统一用仓储基类的 `updateWithVersion`，条件含 `version`，影响 0 行抛 90002                             |
| 软删除     | 默认查询经基类自动加 `isNull(deletedAt)`；需要包含已删除数据时显式调用 `withDeleted()`                    |
| 迁移       | public 与学校库迁移都是手写 SQL 文件（学校库用 `__SCHEMA__` 占位），文件名 `NNNN_说明.sql`，只增不改      |
| 类型       | 查询结果类型由 Drizzle 推导；对外返回前用 contracts 中的响应 schema 转换，不直接返回表行                  |
| 原生 SQL   | 只能用 `sql` 模板（自动参数化），禁止字符串拼接                                                           |
| 版本       | 锁定精确版本；升级前阅读更新日志并跑完整测试                                                              |

表定义可展开 `commonColumns()`，并在手写 SQL 迁移中同步列定义。ID 由 Drizzle 生成 UUID v7，初始版本为 0。仓储接收数据库或事务，读写均要求调用方提供数据范围条件。更新及软删除原子递增版本，同时写入更新时间与操作身份。调用方应先处理资源可见性，带版本写入影响零行统一返回 90002。`withDeleted()` 返回只读查询入口，仍要求提供数据范围条件。

## 5. 测试

| 层       | 工具                                              | 要求                                                            |
| -------- | ------------------------------------------------- | --------------------------------------------------------------- |
| 纯函数   | Vitest                                            | domain 包覆盖率 ≥ 90%                                           |
| 接口集成 | Vitest + Testcontainers（真实 PostgreSQL、Redis） | 每个接口至少一个成功与一个权限失败用例                          |
| 隔离     | 专用测试套件                                      | 跨学校、跨部门、教师班级、代理商授权撤销                        |
| 端到端   | Playwright                                        | 登录 → 选择组织 → 选择模块 → 模块工作台；学校开通向导；导入学生 |

## 6. CI

```
install → biome → typecheck → unit → integration（Testcontainers）→ isolation → build → 依赖与镜像漏洞扫描 → 推送镜像
```

任何一步失败阻断合并。

**当前实际（2026-11-18，`.github/workflows/ci.yml`）**：install → HeroUI Pro 安装 → 依赖声明未被改写检查 → biome 与 UI 控件检查 → 依赖方向 → typecheck → unit → build。集成测试（Testcontainers，目前 34 个文件）、隔离测试、漏洞扫描都还没进 CI，只在开发机上运行。

**集成测试进 CI（T-186，2026-11-18 确认提前）**：

| 项           | 做法                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| 位置         | `ci.yml` 里单独一个任务，和现有检查并行                                                           |
| 触发         | 只在 PR 和 main 分支运行；普通分支的推送只跑现有的快速检查，节省 Actions 额度                     |
| 内容         | 构建 config、contracts、domain、server，运行 `pnpm --filter @smart-sport/server test:integration` |
| 密钥         | 不安装 HeroUI Pro，任务里不出现 `HEROUI_KEY`                                                      |
| 镜像         | PostgreSQL 18.6（T-185 收成的同一个常量）和 Redis 镜像做缓存                                      |
| 合并         | 设为必需检查，失败不能合并                                                                        |
| 不稳定的测试 | 不配置自动重跑；偶发失败要修测试或修代码                                                          |

隔离测试套件、漏洞扫描、推送镜像仍归 T-183。在 T-186 完成之前：

- 涉及数据库、权限或数据范围的提交，汇报里必须写明本地运行的集成测试命令和结果（AGENTS 第 8 节）。
- 不能把“CI 通过”当作集成测试通过。

## 7. 环境

| 环境        | 说明                                             |
| ----------- | ------------------------------------------------ |
| development | 本地；默认密码 `123456`；`seed-demo` 可用        |
| test        | CI 与测试服务器；默认密码 `123456`；自动重建数据 |
| production  | 禁止默认密码；必须配置全部密钥；关闭 `/api/docs` |

配置由环境变量注入，启动时用 Zod 校验，缺失即启动失败。

## 8. 部署

Docker Compose 服务：postgres、redis、minio、migrate（一次性）、server × N、worker、web（Nginx）。

发布顺序：构建镜像 → migrate（public 迁移 → 菜单与内置角色同步 → 学校库增量迁移）→ 滚动更新 server、worker → 更新 web。

**不停机规则（先加后删）**：

1. 版本 N：只新增列 / 表，新旧代码都能运行。
2. 版本 N+1：代码不再使用旧列。
3. 版本 N+2：删除旧列。

server 收到 SIGTERM 后停止接收新请求，处理完进行中的请求再退出（最长 30 秒）。

**试运行形态**：`deploy/host/` 是一台服务器上的试运行部署（systemd 运行 server、worker、Nginx；Redis、MinIO 用容器；PostgreSQL 用服务器共享实例）。它不替代上面的 Compose 生产编排，也不算 T-181 完成。`deploy/host/` 只放本项目需要的文件，已有的服务器运维脚本保持现状（见 REVIEW R-05），以后新增的部署文件只放本项目需要的内容。

**数据库版本**：统一为 PostgreSQL 18.6（2026-11-18 确认）。开发容器（`deploy/compose.dev.yaml`）、集成测试的 Testcontainers 镜像、生产必须是同一个小版本：

- 开发和测试用官方 `postgres` 镜像的 18.6 alpine 版本，精确标签已在 T-185 锁定为 `postgres:18.6-alpine3.23`。
- 镜像标签只在 `deploy/compose.dev.yaml` 声明；测试辅助模块 `tests/helpers/postgres-image.ts` 读取并导出 `POSTGRES_IMAGE`，各测试文件引用它，不再各自写死。
- 生产升级小版本时，先在开发和测试里换成同一版本跑完整集成测试，再升生产。升级大版本要单独评审。
- T-185已切换本地与测试到18.6：使用新卷和18官方父目录挂载，旧17卷保留；已有数据先逻辑备份，再恢复到18空库。此处不表示已执行生产升级。

## 9. 备份

- 每日 03:00 `pg_dump` 全库，保留 7 天，存放到数据库服务器以外的存储。
- 试运行服务器目前只有本机备份，不满足上一条；放进真实学校数据前必须先完成 T-182。
- MinIO 里的文件（导入文件、导出结果）同样需要备份，和数据库备份放在一起。
- 完整恢复方案与演练不在 M1。

## 10. 可观测（P1 为主）

- M1：pino 结构化日志（含 traceId、identityId、schoolId）；`/health/live`、`/health/ready`。
- P1：@nestjs/observe + OpenTelemetry 链路与指标；前端错误上报；运维面板（队列、学校库迁移状态、失败任务重试）；功能开关。

## 11. 验收标准

- 新开发者按 README 两条命令可在本地跑起全部服务。
- 不符合规范的提交信息被 commit-msg 钩子拒绝。
- 生产配置缺少任一密钥时服务拒绝启动。
- 滚动发布期间持续请求无 5xx。
