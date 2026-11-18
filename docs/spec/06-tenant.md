# 06 · 学校库（租户）

## 1. 目标

每所学校一个独立 schema；开通、迁移、停用、导出、销毁全过程可控；业务代码只能通过 TenantService 访问学校数据。

## 2. 数据

**school_tenants**

| 字段           | 说明                                                                          |
| -------------- | ----------------------------------------------------------------------------- |
| school_id      | 主键                                                                          |
| schema_name    | `school_` + 学校 UUID 去横线（32 位小写十六进制），唯一                       |
| datasource     | 数据源 key，默认 `default`                                                    |
| schema_version | 已执行到的学校迁移版本                                                        |
| status         | `provisioning` · `active` · `failed` · `suspended` · `archived` · `destroyed` |
| last_error     | 最近一次失败原因                                                              |

登记表同时带创建、更新、操作者、软删除和乐观锁公共字段，以`school_id`作为主键。数据库约束同时校验schema名白名单以及与学校UUID的对应关系；应用层在构造Drizzle表对象前再次校验。

缓存一致性（T-060）：`public.tenant_registry_revision`保存单调版本。登记增改删及组织类型、状态、软删除变更通过数据库触发器在同一事务推进版本；每次`forSchool`校验已提交版本，变化时清空本进程缓存。登记与版本在一个查询快照读取，回滚不推进版本。缓存最多1000所学校，缓存命中仍检查数据库版本，不用TTL延迟停用生效。

数据源配置：环境变量 `DATABASE_URL`（default）与 `EXTRA_DATASOURCES`（JSON，`{ "ds_hz": "postgres://…" }`）。

## 3. 组件

| 组件                                | 职责                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `DataSourceRegistry`                | 按 key 管理连接池与 Drizzle 实例                                                                   |
| `TenantService.forSchool(schoolId)` | 查 `school_tenants`（缓存），校验 `active`，返回 `{ db, t }`；`t` 是按 schema 名生成并缓存的表对象 |
| `TenantMigrator`                    | 按版本执行学校迁移；迁移 SQL 用 `__SCHEMA__` 占位                                                  |
| `provision` 任务                    | 开通：登记 → 建 schema → 执行全部迁移 → active                                                     |

## 4. 规则

1. schema 名只由系统生成，拼接前用 `^school_[0-9a-f]{32}$` 校验；不切换 `search_path`。
2. 开通在 worker 中执行；建 schema 与全部迁移在一个事务内，失败则状态为 `failed` 并记录原因，可重试。
3. 发布时 migrate 任务先迁 public，再逐校增量迁移；用 `pg_advisory_lock` 防并发；学校多时分批并发（默认 10 所一批），单校失败不阻塞其他学校，失败名单进入运维面板。
4. 学校迁移必须向后兼容（先加后删，见 spec 15）。
5. 学校库不建引用 public 的外键，只存 id。
6. 状态与访问：

| 状态                  | 后台访问                            |
| --------------------- | ----------------------------------- |
| active                | 正常                                |
| suspended（服务停用） | 只允许学校管理员登录导出（spec 07） |
| archived              | 不可访问，数据保留                  |
| destroyed             | schema 已删除，仅保留登记与审计     |

7. 学校迁移文件放在 `apps/server/migrations/school/`，命名和 public 一样是 `NNNN_说明.sql`，版本号独立编号；每个学校 schema 里有自己的迁移记录表。
8. 学校库在非默认数据源时，“建 schema + 全部迁移”的事务只在目标数据源里；`school_tenants` 在 public，状态在事务提交后单独更新。开通任务可以重跑，重跑时先看目标数据源里的迁移记录，不靠 `school_tenants` 判断是否已开通。
9. 开发与测试环境提供命令：为指定学校开通，以及为所有还没有学校库的学校补开通。生产环境禁用这两个命令，生产开通只走向导（spec 14）。
10. 销毁前必须完成“全量导出并交付”的待办确认，执行人需有 `platform:subscription:approve`，且不能是发起销毁的人，写审计。
11. 同一数据源内跨 public 与学校库的写入放在同一事务；跨数据源走 outbox（spec 11）。

T-060只提供内部基础设施入口，没有新增HTTP接口。学校库尚未自动开通时由T-061/T-062执行迁移与开通；学校业务表工厂在T-090扩展。`forSchool`只检查学校与登记是否可用，不代替T-053的身份权限、代理商授权和学校服务守卫；已获取的事务应由调用方在相应业务边界重新鉴权。

## 5. 接口

| 方法 | 路径                         | 权限                            | 说明                           |
| ---- | ---------------------------- | ------------------------------- | ------------------------------ |
| GET  | `/tenants?status&page`       | `platform:onboarding:view`      | 学校库状态列表                 |
| POST | `/tenants/:schoolId/retry`   | `platform:onboarding:update`    | 重试开通 / 迁移                |
| POST | `/tenants/:schoolId/export`  | `platform:subscription:update`  | 全量导出（任务中心生成压缩包） |
| POST | `/tenants/:schoolId/archive` | `platform:subscription:update`  | 归档                           |
| POST | `/tenants/:schoolId/destroy` | `platform:subscription:approve` | 销毁（需已确认交付）           |

## 6. 验收标准

- 新学校开通后自动具备最新版本的全部学校表。
- 自动化测试：A 校身份用 A 的令牌请求 B 校任何接口均返回 404。
- 并发 50 个请求分别访问 10 所学校，数据不串校。
- 单校迁移失败时，其余学校迁移完成，失败学校显示在运维面板并可重试。
- 学校库层的分步验收见 TASKS“S-11A 验收”（2026-11-18 提前）。接口层“A 校令牌请求 B 校返回 404”在 T-053 完成后验收。
