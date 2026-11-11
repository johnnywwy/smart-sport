# 05 · 数据范围

## 1. 目标

所有身份用同一套规则决定“能看到哪些数据”，结果可解释、可预览、计算足够快。

## 2. 计算公式

```
可见 = 外边界 ∩ ( 角色数据范围展开 ∪ 本人额外负责 )
```

| 身份           | 外边界                               | 粒度        |
| -------------- | ------------------------------------ | ----------- |
| company        | 全部启用学校                         | 学校        |
| bureau         | `orgs.region_code` 辖区内学校        | 学校        |
| agent          | 有效授权的学校（未撤销、在有效期内） | 学校        |
| school         | 本校                                 | 年级 / 班级 |
| teacher        | 本校                                 | 年级 / 班级 |
| student        | 本人                                 | 学生        |
| parent（预留） | 已绑定孩子                           | 学生        |

| 数据范围选项                  | 展开                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| 本机构全部 `all`              | 外边界全部                                                                  |
| 本部门及以下 `dept_and_below` | 本部门及所有子孙部门的 `department_scopes` 合并                             |
| 本部门 `dept`                 | 本部门的 `department_scopes`                                                |
| 本人负责 `personal`           | 空（只剩本人额外负责）；teacher 额外包含本学年任教行政班 + 本学期任教教学班 |

数据范围按**权限码**计算：某个权限码由多个角色授予时，取这些角色中最宽的选项；没有授予该权限码的角色，其数据范围不参与。例如角色 A（本机构全部，学生查看）+ 角色 B（本部门，学生编辑）：查看学生用本机构全部，编辑学生只限本部门。

## 3. 数据

**identity_scopes**：`(identity_id, scope_type, scope_value)`，scope_type 同部门（spec 03），用于本人额外负责。

**agent_school_grants**

| 字段                                                 | 说明                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| agent_id / school_id                                 |                                                         |
| permissions                                          | text[]，授权上限权限码                                  |
| valid_from / valid_to                                | valid_to 必填，最晚到当前学年的结束日期；不提供长期授权 |
| granted_by / revoked_at / revoked_by / revoke_reason | 收回时必须填写原因                                      |

部分唯一索引 `(agent_id, school_id) WHERE revoked_at IS NULL`。

## 4. 结果形态与缓存

服务端把结果归一为：

```ts
type VisibleScope =
  | { kind: "all-schools" } // company all
  | { kind: "schools"; schoolIds: string[] } // company / bureau / agent 细分后
  | {
      kind: "school";
      schoolId: string;
      grades?: number[];
      classIds?: string[];
      collegeIds?: string[];
    }
  | { kind: "self"; studentId: string }
  | { kind: "children"; studentIds: string[] };
```

- 结果按“身份 × 数据范围选项”缓存在 Redis `scope:{identityId}:{option}`，TTL 10 分钟；请求时由所需权限码对应的选项取用。
- 失效事件：部门调整、部门范围变更、本人范围变更、角色数据范围变更、代理商授权变更、学校开通或停用、任课关系变更、学年切换。
- 区域展开：按 `regions.path` 前缀查询学校；数量大时以 `schoolIds` 存 Redis Set。

## 5. 使用方式

| 场景            | 做法                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| 学校列表（ops） | 按 `VisibleScope` 过滤 `orgs`                                                                           |
| 学校内接口      | `SchoolAccessGuard` 判断 schoolId 可见；Service 用 `scopeFilter(t)` 生成年级 / 班级条件                 |
| 代理商          | 额外校验请求的权限码在授权 `permissions` 内                                                             |
| 首页统计        | 只统计可见范围                                                                                          |
| 不可见的数据    | 返回 404（见 spec 00）                                                                                  |
| 写操作          | 用该写权限码对应的数据范围再校验一次目标记录；超出范围返回 404                                          |
| 列表行操作      | 列表按“查看”的范围返回；每行附带 `allowedActions`（按各动作的范围逐行计算），前端只为该行显示允许的按钮 |

示例：某人“查看学生”是本机构全部，“编辑学生”只限本部门（初三）。学生列表能看到全校，但只有初三学生行显示“编辑”；直接调用编辑接口修改初一学生，返回 404。

## 6. 接口

| 方法   | 路径                                                 | 权限                        | 说明                                                                                                                          |
| ------ | ---------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/scope/schools?keyword&page`                        | 登录                        | 当前身份可见学校（ops 列表、选择学校）                                                                                        |
| GET    | `/identities/:id/visible`                            | `org:member:view`           | “实际可见”：数量、明细、计算过程（角色范围 → 部门范围 → 本人额外 → 外边界）                                                   |
| PUT    | `/identities/:id/scopes`                             | `org:member:update`         | 设置本人额外负责                                                                                                              |
| POST   | `/scope/preview`                                     | `org:role:view`             | 给定角色、部门、本人范围，返回预计可见数量（配置页实时显示）                                                                  |
| GET    | `/schools/:schoolId/agent-grants`                    | `school:agent-grant:view`   |                                                                                                                               |
| POST   | `/schools/:schoolId/agent-grants`                    | `school:agent-grant:create` | `{ agentId, permissions, validTo }`                                                                                           |
| PATCH  | `/schools/:schoolId/agent-grants/:id`                | `school:agent-grant:update` | 调整权限或有效期                                                                                                              |
| DELETE | `/schools/:schoolId/agent-grants/:id`                | `school:agent-grant:delete` | 收回，`{ reason }`（记录 revoked_at、revoke_reason）                                                                          |
| GET    | `/schools/:schoolId/agent-grants/candidates?keyword` | `school:agent-grant:create` | 代理商候选（只返回名称）                                                                                                      |
| GET    | `/schools/:schoolId/accessors`                       | `school:agent-grant:view`   | **P1** 谁能访问本校数据：当前可访问本校的代理商员工与公司员工（姓名、所属组织与部门、能做什么）；最近 30 天外部人员的访问记录 |

公司员工按自身数据范围直接访问学校明细，无需学校授权（决策 Q2），但所有访问与修改都写审计，并出现在上面的“谁能访问本校数据”页面中。

## 7. 规则

1. 代理商不能给自己授权；授权只能由学校（或公司超管代办并留痕）发起。
2. 授权 `permissions` 只能从“可授权给代理商的权限码”清单中选（代码声明）：school 应用的 profile 查看；class、teaching-class、student、teacher 的查增改导入；rollover 的查看与办理。导出和查看敏感信息（student、teacher 的 `export`、`sensitive`）要单独勾选，默认不给。成员账号、角色权限、转学、代理商授权本身永远不在清单内。
3. 撤销授权立即生效：清除该代理商所有身份的范围缓存。
   3a. 授权必须有到期日，最晚到当前学年结束；学年升级后需要重新授权或续期。到期当天自动失效（每日任务写 revoked_at，原因记为“到期”），并清除范围缓存。
   3b. 到期前 7 天给本校有 `school:agent-grant:update` 权限的人发一条续期待办。授权、调整、收回、到期都通知代理商的管理员，并写入本校操作记录。
4. 角色是“本部门 / 本部门及以下”但身份没有部门时，结果为空，界面标红提示。
5. 教师“本人负责”按当前所选学年学期的任课关系计算；切换学年查看历史时按该学年的任课关系。

## 8. 验收标准

- 代理商 A 运营一部成员只能看到学校甲、乙；学校甲撤销对 A 的授权后，该成员下一次请求即看不到甲。
- 新建授权时不填到期日或到期日晚于当前学年结束，接口拒绝；授权到期后代理商成员下一次请求即看不到该校。
- 只授权了学生查看和修改的代理商，调用导出接口返回 403，列表中的证件号为脱敏值。
- 销售总监（本部门及以下）能看到下级两个销售组负责学校的并集。
- 年级组长（本部门，负责 23）只能看到初三班级与学生；直接请求其他年级班级返回 404。
- “实际可见”接口返回的数量与列表接口返回的总数一致。
- 缓存命中时，数据范围判断耗时 < 5ms。
