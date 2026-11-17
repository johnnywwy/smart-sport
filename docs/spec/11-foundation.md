# 11 · 通用能力

导入导出、任务中心、文件、数据字典、系统参数、编号规则、站内消息、outbox、回收站、待办。所有业务模块复用，不各自实现。

## 1. 导入

```
下载模板 → 上传文件 → 解析与逐行 Zod 校验（worker）→ 预览（成功行 / 失败行及原因）
→ 确认导入（worker，分批事务）→ 结果（成功数、失败数、失败行文件）
```

- 模板由功能模块在 contracts 中声明（列名、示例、Zod schema、名称到编码的转换）。
- 支持 .xlsx，单次最多 10,000 行、10 MB。
- 预览结果保留 24 小时；确认时带幂等键。
- 失败行文件可下载，修改后重新上传。
- 确认之前不写入任何业务数据；确认时可以只导入校验通过的行。
- 用业务唯一键判断是不是同一条记录（学生用证件号哈希）：已存在的更新，不存在的新增，所以同一份文件重复导入不会产生重复数据。

**导入批次与撤销**

**import_batches**（学校内的导入放学校库，平台级导入放 public）：no（系统编号 `DR-…`）、feature、file_id、status（previewed · importing · done · undoing · undone · failed）、total / created_count / updated_count / skipped_count、created_ids jsonb（本批新增的记录：表名 → id 列表，含自动新建的班级）、confirmed_by、confirmed_at、undone_by、undone_at。

- 确认导入后 24 小时内可以撤销本批（参数 `import.undo_hours`，默认 24）。
- 撤销只软删除本批**新增**的记录；本批**更新**过的已有记录不回退，结果页要写明这一点。
- 本批新增的记录在撤销前已被其他数据引用（如学生已有转学申请、班级里有不属于本批的学生）时，该条跳过并在撤销结果中列出。
- 撤销在 worker 中执行，写审计；接口 `POST /schools/:schoolId/imports/:id/undo`，权限为该功能模块的 `import`，带幂等键。
- 错误码：20301 已超过可撤销时间；20302 该批次已撤销或正在撤销。

## 2. 导出

- 按当前筛选条件异步生成 .xlsx；只导出可见范围内的数据。
- 文件加水印（导出人、时间、组织），敏感字段默认脱敏，有“查看敏感信息”权限者可选择不脱敏（写审计）。
- 导出文件 24 小时后清理。

## 3. 任务中心

**tasks**：no（系统编号 `RW-…`）、type（import · export · provision · rollover · tenant_export · …）、identity_id、school_id、status（queued · running · succeeded · partial · failed · cancelled）、progress（0–100）、summary jsonb、result_file_id、error。

- 接口：`GET /tasks?mine=true&status`、`GET /tasks/:id`、`POST /tasks/:id/cancel`。
- 顶栏显示进行中的任务数；完成后发站内消息。

## 4. 文件

**files**：object_key（`{schoolId 或 platform}/{yyyy}/{mm}/{uuid}`）、filename、content_type、size、sha256、school_id、purpose、expires_at。

- 上传：`POST /files`（multipart），校验扩展名白名单、大小、文件头（magic number）。
- 下载：`GET /files/:id/url` 返回 5 分钟有效的临时链接；校验可见范围。

## 5. 数据字典

**dict_types**：code、name、is_system；**dict_items**：type_code、value、label、sort、enabled。

- 内置字典及其内置选项随代码同步；管理员不能修改显示名称、排序、启停或删除（2026-11-17 用户确认，统一 spec 13 与最新设计稿）。
- 字典类型由代码声明，不提供页面新增类型。首批包含性别、民族、学段、年级、证件类型、组织类型、身份类型；仅证件类型允许新增自定义选项，其他类型保持固定，避免新增选项绕过业务枚举。
- 自定义选项由服务端生成不可变的 value，用户仅填写名称、说明、排序与启用状态。同字典未删除选项名称唯一；可以修改名称、说明、排序及启停。未使用过的可软删除，使用过后只能停用、不能删除。停用后不再供新业务选择，历史记录仍可按原 value 解析名称。
- 业务写入必须在同一事务中通过 DictsService.use 校验启用状态并登记首次使用；历史解析使用 DictsService.resolve，不允许将“查询下拉选项”当作业务使用。首次使用标记不因业务记录后续删除而清除。跨数据源写入仍遵守 outbox 约定；当前尚无跨库字典消费模块。
- 接口：`GET /dicts/:typeCode`（有效身份级登录可用，只返回启用且未删除的选项，前端按身份缓存）；管理接口权限 `system:dict:*`，且仅公司身份可维护。
- 管理接口：`GET /dict-types` 返回类型及各类型新增能力；`GET /dict-types/:typeCode/items` 为分页选项列表（keyword、enabled、sort）；`POST /dict-types/:typeCode/items` 幂等新增；`PATCH /dict-items/:id` 与 `DELETE /dict-items/:id` 带 version。每行返回 allowedActions，内置行恒为空，已使用自定义行不返回 delete。
- 管理写操作同事务重读权限、执行乐观锁并写审计。内置只读 30010，不可扩展类型 30011，已使用不能删除 30012，同字典重名 30013，选项停用不能用于新业务 30014。

## 6. 系统参数

**sys_params**：key、value jsonb、value_schema（Zod 描述）、remark。

| 参数                      | 默认 | 允许的整数范围         |
| ------------------------- | ---- | ---------------------- |
| `password.min_length`     | 8    | 8～64                  |
| `password.expire_days`    | 0    | 0～365，0 表示不过期   |
| `login.lock_threshold`    | 10   | 5～100                 |
| `subscription.trial_days` | 30   | 1～365                 |
| `subscription.grace_days` | 30   | 0～365，0 表示无宽限期 |
| `recycle.retention_days`  | 30   | 1～365                 |
| `import.undo_hours`       | 24   | 1～168                 |
| `rollover.undo_days`      | 7    | 1～30                  |

实施约定（T-116，用户已确认）：

- 八个参数由 contracts 代码声明并幂等初始化，只补缺失项、不覆盖已修改值；名称、说明和整数校验描述随代码维护，不从数据库执行 Zod 或脚本。管理端仅改值，不允许新增、删除、改键或改校验规则。
- `GET /system-params` 分页查询（keyword、name/updatedAt 排序）；`GET /system-params/:id` 详情；`PATCH /system-params/:id` 提交整数 value、version 和必填修改原因 reason（1～500 字）。查询和修改只限公司身份的 `system:param:view/update`，行返回 allowedActions；非法值返回90001及value字段错误，旧版本90002，不存在90004。
- 写事务在权限修订屏障内重读权限，更新与修改前后值、原因审计一起提交或回滚。读取真实数据库，不使用进程内参数缓存，跨实例修改后后续读取立即采用新值。更新不提供新增接口，不需要创建幂等键。
- 密码最少长度用于生产环境后续改密，开发/测试仍允许默认密码；不追溯拒绝现有短密码登录。有效期依据 password_changed_at 在登录时判断，启用非零后过期或无改密时间的账号必须先改密；0不启用，既有首次改密标志仍生效。
- 登录锁定阈值仅提供配置，T-022仍按用户要求暂缓。试用、宽限、回收站、导入撤销、学年升级撤回随对应业务任务接入，不虚报消费功能完成；后续业务在生成服务期或撤销截止时间时读取，不改写已有截止时间。

## 7. 编号规则

**number_rules**：type、prefix、digits、reset（yearly · never）、year、current_value。

| type                 | 示例           |
| -------------------- | -------------- |
| subscription         | FW-2026-000123 |
| subscription_request | KT-2026-000045 |
| transfer             | ZX-2026-000007 |
| task                 | RW-2026-001234 |
| todo                 | DB-2026-000321 |

取号使用 `UPDATE … RETURNING` 行锁，保证不重号。

### T-110 实施约定

- 编号对象在 contracts 声明，含上表五类及导入批次 `import / DR`。初始均为六位流水、每年重置；幂等初始化只补缺失规则，不覆盖管理人员修改。
- 管理接口为 `GET /number-rules`（`system:number:view`）和 `PATCH /number-rules/:id`（`system:number:update`）。只向公司身份开放；列表返回名称、配置、年度、当前流水、下一编号预览、版本及行操作能力。预览不消耗编号，用尽或系统时间异常时为空。
- 修改须携带版本，只允许修改前缀、位数、重置周期。前缀为1至12位大写字母或数字、以字母开头；流水位数为1至12，缩短后仍须容纳已分配的流水值。不能修改对象、年度、当前流水、手动重置或删除内置规则；修改写平台审计，只影响之后新编号。
- 统一格式为 `前缀-四位年份-补零流水`。年度按数据库 `clock_timestamp()` 的上海时间取得，获得规则行锁后再读时钟；`yearly` 跨年重新从1开始，`never` 跨年继续流水但使用当年年份。时钟早于已发年度时拒绝取号，不回拨年度或流水。
- 取号为后端内部服务，无公开取号接口；调用方显式传入业务事务，计数、已发编号登记和业务写入一起提交或回滚。`number_issues` 为永久防重登记，记录规则、前缀、年份、流水和实际编号；即使更换、复用历史前缀或缩短位数，也跳过已发流水，实际编号具有数据库唯一约束。前缀不得与另一条启用规则重复。
- 错误码：`30001` 流水用尽（409，禁止截断或溢出）；`30002` 前缀被其他规则使用（409）；`30003` 系统时间早于编号年度（503）。旧版本使用 `90002`，无此规则使用 `90004`；修改失败不改变配置、计数或审计。

## 8. 站内消息

**notifications**：user_id、identity_id（可空）、client、category（task · todo · subscription · system）、title、content、link、read_at。

- 接口：`GET /notifications?unread`、`POST /notifications/:id/read`、`POST /notifications/read-all`。
- 邮件作为第二通道（到期提醒、找回密码）。

## 9. outbox

**outbox_events**：id（UUID v7，天然有序）、topic、school_id、payload、status、attempts、next_retry_at、published_at。

- 业务写库时在同一事务写入事件；worker 轮询投递到 BullMQ，消费者需幂等。
- 失败指数退避重试，超过 10 次进入运维面板告警。
- M1 使用的事件：`school.student.created`、`school.student.status_changed`、`subscription.changed`、`scope.changed`（触发缓存失效）。

## 10. 回收站

- 软删除数据 30 天内可在各列表“回收站”页签中恢复（权限：对应功能模块的 delete）。
- 恢复时检查唯一约束冲突，冲突则提示先处理。
- 到期由清理任务彻底删除并写审计。

## 11. 待办

**todos**：no、type（transfer_confirm · subscription_review · tenant_delivery_confirm）、title、assignee_org_id、required_permission、ref_type、ref_id、payload、status（pending · approved · rejected · cancelled · expired）、handled_by、handled_at、comment、created_by。

- 分发：当前身份所在组织 = `assignee_org_id`，且拥有 `required_permission`，即可看到并处理。
- 一人处理后其他人看到“已处理”；处理结果通知发起人；写审计。
- 接口：`GET /todos?tab=pending|done|mine`、`GET /todos/count`、`POST /todos/:id/approve`、`POST /todos/:id/reject`（带 comment）。
- 不做可配置多级审批流。

## 12. 验收标准

- 导入含错误行的文件，预览准确列出错误，确认后只导入正确行，失败行可下载。
- 同一份学生表格导入两次，第二次全部识别为已存在，不新增学生。
- 导入后 24 小时内撤销，本批新增的学生和自动新建的班级消失，本批只是更新过的学生保持不变；超过 24 小时返回 20301。
- 导出文件带水印，无权限者导出的证件号为脱敏值。
- 并发取号 1000 次无重复。
- outbox 消费者重复收到同一事件，结果不变。
- 待办在同组织两名管理员处同时出现，一人处理后另一人看到已处理。
