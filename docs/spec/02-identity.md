# 02 · 身份与选择组织

## 1. 目标

一个账号拥有多个身份；登录后选择组织（身份）进入系统；工作中可随时切换。

## 2. 数据

**identities**

| 字段          | 说明                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| user_id       | 账号                                                                                 |
| type          | `company` · `bureau` · `agent` · `school` · `teacher` · `student` · `parent`（预留） |
| org_id        | 所属组织；teacher、student、parent 指向学校                                          |
| department_id | 所属部门，可空                                                                       |
| ref_id        | student 指向学校库学生 id；parent 预留                                               |
| title         | 职务，可空                                                                           |
| status        | 1 启用 · 0 停用                                                                      |
| sort          | 选择组织页的排序                                                                     |

约束：

- 唯一 `(user_id, org_id, type)`（未删除）。
- 身份类型与组织类型匹配：company↔company，bureau↔bureau，agent↔agent，school / teacher / student / parent ↔ school。
- M1 后台不允许 student、parent 身份登录后台（`client=admin` 时过滤）。

**identity_roles**：`(identity_id, role_id)`。

## 3. 身份上下文

每个请求加载并放入 CLS：

```ts
interface IdentityContext {
  userId: string;
  identityId: string;
  tokenVersion: number;
  client: "admin" | "mobile";
  identityType: IdentityType;
  orgId: string;
  orgType: OrgType;
  departmentId: string | null;
  roleIds: string[];
  // 权限码 → 该权限可用的数据范围。同一权限码由多个角色授予时，取这些角色中最宽的范围：
  // all > dept_and_below > dept > personal
  permissions: Map<string, DataScopeOption>;
}
```

> 不按“身份整体取最宽范围”，避免角色 A（本机构全部 + 只读）与角色 B（本部门 + 编辑）组合后变成“本机构全部 + 编辑”。

- 缓存于 Redis `ctx:{identityId}`，TTL 10 分钟。
- 以下变化时删除缓存：身份、角色、角色档位、部门调整、内置角色同步、账号停用。多实例通过 Redis 发布订阅广播。

## 4. 接口

| 方法 | 路径                    | 令牌           | 说明                                               |
| ---- | ----------------------- | -------------- | -------------------------------------------------- |
| GET  | `/auth/identities`      | 账号级或身份级 | 我的身份列表（见下）                               |
| POST | `/auth/select-identity` | 账号级或身份级 | `{ identityId }` → 身份级令牌 + `me`               |
| GET  | `/auth/me`              | 身份级         | 当前用户、当前身份、权限码、数据范围摘要、可用应用 |

身份列表项：

```json
{
  "id": "…",
  "type": "agent",
  "typeName": "代理商",
  "orgName": "某体育服务代理商",
  "departmentName": "运营一部",
  "lastUsed": true,
  "available": true,
  "unavailableReason": null
}
```

`available=false` 的情况：组织停用、学校服务已停用（只允许学校管理员进入导出）、M1 中的 student / parent 身份。

## 5. 规则

1. 登录后：身份数量为 1 且可用 → 自动选择并进入门户；否则进入选择组织页。
2. 选择组织页按组织类型分组：公司 → 教育局 → 代理商 → 学校；`lastUsed` 的排在最前并高亮。
3. 选择身份时校验身份属于本人、状态启用、组织启用；写 `users.last_identity_id` 与审计 `identity.select`。
4. 切换身份（顶栏）与选择身份是同一接口；前端切换后清空所有缓存数据，回到新身份的门户。
5. 一个会话同时只有一个身份。多个标签页共用同一个会话（refresh Cookie 是共享的），以最后一次选择为准：AuthGuard 校验令牌中的 `iid` 与会话当前的 `identity_id`（随会话缓存在 Redis）一致，不一致返回 401 与错误码 11005；前端收到 11005 后提示“已在其他页面切换身份”，清空缓存数据并跳到当前身份的门户。

## 6. 错误码

| 码    | 含义                         |
| ----- | ---------------------------- |
| 11001 | 身份不存在或不属于当前账号   |
| 11002 | 身份已停用                   |
| 11003 | 组织已停用                   |
| 11004 | 该身份暂不支持登录后台       |
| 11005 | 已在其他页面切换身份，请刷新 |

## 7. 验收标准

- 只有一个身份的账号登录后直接进入门户。
- 多身份账号登录后看到按类型分组的组织卡片，上次使用的排第一。
- 切换身份后，原身份的列表数据不会在新身份下闪现。
- 修改某身份的角色后 5 秒内，该身份的菜单与接口权限生效。
