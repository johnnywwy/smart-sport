# 07 · 学校服务与应用开通

## 1. 目标

记录每所学校的服务期与已开通的应用；服务状态和应用开通直接参与权限计算。

## 2. 数据

**school_subscriptions**

| 字段                        | 说明                                                  |
| --------------------------- | ----------------------------------------------------- |
| school_id                   | 每校一条当前记录，历史另存 `school_subscription_logs` |
| no                          | 系统编号，如 `FW-2026-000123`                         |
| contract_no                 | 合同编号，试用为空                                    |
| service_start / service_end |                                                       |
| grace_days                  | 宽限期天数，默认 30                                   |
| status                      | `trial` · `active` · `grace` · `suspended`            |
| sales_identity_id           | 负责销售                                              |

**school_apps**：`(school_id, app_code)`、`start_date`、`end_date`、`source`（contract · trial · gift）。

基础应用 `school`（学校基础数据）、`org`（组织与权限）随服务开通，不单独售卖。

## 3. 状态流转

```
trial（默认 30 天）--签约--> active --到期--> grace（只读）--宽限期结束--> suspended
grace / suspended --续约--> active
suspended --学校申请--> 导出交付后归档或销毁（spec 06）
```

- 每天 01:00 由 worker 计算状态。
- 到期前 90 / 30 / 7 天给负责销售发站内消息与邮件。

## 4. 对权限的影响

| 状态           | 学校类身份                   | company / agent 进入该校 |
| -------------- | ---------------------------- | ------------------------ |
| trial / active | 按开通应用正常使用           | 同左                     |
| grace          | 只保留 view、export          | 同左                     |
| suspended      | 仅学校管理员可登录，仅可导出 | 不可进入                 |

应用未开通或已过期：门户不显示该应用卡片；相关接口返回 403（错误码 13001）。

## 5. 接口

| 方法 | 路径                                            | 权限                            | 说明                                     |
| ---- | ----------------------------------------------- | ------------------------------- | ---------------------------------------- |
| GET  | `/subscriptions?status&expiringInDays&page`     | `platform:subscription:view`    | 按数据范围过滤（销售只看负责的）         |
| GET  | `/subscriptions/:schoolId`                      | `platform:subscription:view`    | 含应用列表与历史                         |
| POST | `/subscriptions/:schoolId/requests`             | `platform:subscription:create`  | 提交开通 / 续约 / 变更应用申请，生成待办 |
| POST | `/subscriptions/:schoolId/requests/:id/approve` | `platform:subscription:approve` | 审核通过后生效                           |
| POST | `/subscriptions/:schoolId/requests/:id/reject`  | 同上                            |                                          |
| GET  | `/schools/:schoolId/apps`                       | 登录（可见该校）                | 学校当前可用应用                         |

## 6. 规则

1. 销售（编辑档）提交申请；拥有 `approve` 动作的人审核；同一人不能审核自己提交的申请。
2. 每次状态与应用变更写 `school_subscription_logs` 与审计。
3. 状态变化后清除该校所有相关身份的上下文缓存。

## 7. 错误码

| 码    | 含义                               |
| ----- | ---------------------------------- |
| 13001 | 学校未开通该应用或已到期           |
| 13002 | 学校服务处于宽限期，仅可查看与导出 |
| 13003 | 学校服务已停用                     |
| 13004 | 不能审核自己提交的申请             |

## 8. 验收标准

- 学校服务到期后进入宽限期，学校管理员新增学生被拒绝、导出可用。
- 学校未开通的应用不出现在该校身份的门户上。
- 销售的工作台按到期时间列出负责学校。
