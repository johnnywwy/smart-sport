# 01 · 认证

## 1. 目标

用账号密码安全登录，管理令牌与会话；登录后进入“选择组织”（spec 02）。

## 2. 范围

- 含：登录、图形验证码、失败锁定、首次改密、修改密码、忘记密码（邮箱验证码）、令牌刷新与吊销、会话管理、退出。
- 不含：短信验证码（预留接口）、第三方单点登录（后续规划）、移动端登录（M2）。

## 3. 数据

**users**

| 字段                 | 类型         | 说明                                  |
| -------------------- | ------------ | ------------------------------------- |
| username             | varchar(64)  | 唯一（未删除）                        |
| phone                | text         | AES-256-GCM 密文，可空                |
| phone_hash           | varchar(64)  | HMAC-SHA-256，64 位小写十六进制，可空 |
| email                | varchar(128) | 唯一，可空；用于邮箱验证码            |
| real_name            | varchar(64)  |                                       |
| password_hash        | varchar(255) | argon2id                              |
| must_change_password | bool         | 首次登录、管理员重置后为 true         |
| password_changed_at  | timestamptz  | 用于定期改密                          |
| status               | smallint     | 1 启用 · 0 停用                       |
| failed_attempts      | int          | 连续失败次数                          |
| locked_until         | timestamptz  | 锁定截止                              |
| last_identity_id     | uuid         | 上次使用的身份                        |
| token_version        | int          | +1 后所有令牌失效                     |

手机号明文不入库。`phone` 保存 `v{keyVersion}:{iv}:{ciphertext}:{tag}`；`phone_hash` 用于登录查找与查重。两列必须同时有值或同时为空；哈希非空时必须符合 `^[0-9a-f]{64}$`。用户名、手机号哈希、邮箱的唯一索引均只约束 `deleted_at IS NULL` 的账号，软删除后允许复用。

**user_sessions**

| 字段                             | 说明                                   |
| -------------------------------- | -------------------------------------- |
| user_id                          |                                        |
| identity_id                      | 当前会话所选身份，可空（尚未选择组织） |
| client                           | `admin` · `mobile`                     |
| refresh_token_hash               | SHA-256                                |
| expires_at / revoked_at          |                                        |
| ip / user_agent / last_active_at | 会话列表展示                           |

**login_logs**：user_id（可空）、username_input、result（success · bad_password · locked · disabled · captcha_required）、ip、user_agent、created_at。

Redis：`login:fail:{username}` 失败计数；`captcha:{id}`；`email-code:{purpose}:{email}`；`email-code:limit:{email}:{date}`。

## 4. 令牌

| 令牌          | 有效期  | 内容                                        | 可调用                                        |
| ------------- | ------- | ------------------------------------------- | --------------------------------------------- |
| 账号级 access | 10 分钟 | `sub, sid, tv, client, stage=account`       | 仅 spec 02 的“列出身份”“选择身份”、改密、退出 |
| 身份级 access | 30 分钟 | `sub, sid, iid, tv, client, stage=identity` | 全部业务接口                                  |
| refresh       | 7 天    | 随机串，库中存哈希                          | 刷新接口；每次刷新轮换                        |

- 签名算法 EdDSA（jose），密钥由环境注入，支持多密钥轮换（`kid`）。
- `sid` 是会话 id（`user_sessions.id`）。登录时创建会话（`identity_id` 为空），选择身份时把身份写入该会话。
- refresh token 放 HttpOnly + SameSite=Strict Cookie，路径 `/api/v1/auth`（刷新与退出接口都要能收到）；生产环境加 Secure，开发环境 http 下不加。access token 只放前端内存，不写入 localStorage。
- 刷新接口返回的令牌阶段跟随会话：会话已选身份则返回身份级令牌，否则返回账号级令牌。页面刷新后前端靠它恢复登录状态。

## 5. 接口

| 方法   | 路径                      | 说明                                                                                                     |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/auth/captcha`           | 获取图形验证码 `{ captchaId, image }`                                                                    |
| POST   | `/auth/login`             | `{ account, password, captchaId?, captchaCode? }` → `{ accessToken, mustChangePassword, identityCount }` |
| POST   | `/auth/refresh`           | 用 Cookie 中的 refresh 换新令牌（轮换）                                                                  |
| POST   | `/auth/logout`            | 吊销当前会话                                                                                             |
| POST   | `/auth/change-password`   | `{ oldPassword, newPassword }`；成功后吊销其他会话                                                       |
| POST   | `/auth/email-code`        | `{ email, purpose: reset_password · bind_email · confirm }`                                              |
| POST   | `/auth/reset-password`    | `{ email, code, newPassword }`                                                                           |
| GET    | `/auth/sessions`          | 我的在线会话                                                                                             |
| DELETE | `/auth/sessions/:id`      | 下线某个会话                                                                                             |
| POST   | `/users/:id/force-logout` | 管理员强制下线（权限 `org:member:update`，且对方在本组织内）                                             |

`account` 可以是用户名、手机号或邮箱。

## 6. 规则

1. 连续失败 5 次后必须填写图形验证码；10 次锁定 30 分钟；成功登录清零。
2. 账号不存在与密码错误返回同一错误 `10001 账号或密码错误`，防止探测账号。
3. 密码策略（系统参数可调）：生产环境至少 8 位，含字母和数字，不能与用户名相同，不能与最近 3 次相同。
4. **开发与测试环境**：种子账号和新建账号默认密码 `123456`，跳过复杂度校验；生产环境禁止该值，新建账号生成 12 位随机初始密码，并要求首次修改。
5. 定期改密：系统参数 `password.expire_days`，默认 0 表示不启用；启用后过期登录强制改密。
6. 邮箱验证码：6 位数字，5 分钟有效，60 秒后可重发，同一邮箱每天最多 10 次；验证 5 次失败作废。
7. 改密、停用账号、管理员重置密码时 `token_version + 1`，所有令牌立即失效。
8. 登录成功写 `login_logs` 与审计；失败同样记录。

## 7. 错误码

| 码    | 含义                        |
| ----- | --------------------------- |
| 10001 | 账号或密码错误              |
| 10002 | 需要图形验证码 / 验证码错误 |
| 10003 | 账号已锁定，请 N 分钟后再试 |
| 10004 | 账号已停用                  |
| 10005 | 登录已过期，请重新登录      |
| 10006 | 新密码不符合要求（附原因）  |
| 10007 | 邮箱验证码错误或已过期      |
| 10008 | 验证码发送过于频繁          |

## 8. 验收标准

- 输错 5 次出现验证码，10 次后锁定 30 分钟，期间正确密码也无法登录。
- 账号级令牌调用任意业务接口返回 401。
- refresh 被重复使用（已轮换的旧值）时，该会话整体吊销。
- 开发环境用 `123456` 可以登录种子账号；生产配置下创建账号无法设置 `123456`。

### 登录基础持久化的实施顺序

T-021 提前建立会话、身份和审计的最小表结构；登录成功在同一事务中创建账号级会话、写登录日志与 `auth.login` 审计，再返回令牌与 refresh Cookie。后台身份数量只统计未删除、启用且非 student / parent 的身份；组织状态过滤由 T-027 接入。刷新、退出与身份选择接口仍在后续任务完成。手机号 HMAC 使用现有 HMAC 密钥并以 `phone:` 作用途前缀，账号查找不解密手机号。审计初始化建立本月、下月的上海时区月分区及兜底分区，后续由 T-130 完成分区维护。

### Refresh 轮换与退出（T-023）

- `refresh_tokens` 是会话关联历史：`token_hash`（SHA-256，主键）、`session_id`、签发时的 `token_version`、`created_at`、`consumed_at`。不保存原始令牌。历史记录至少保留到会话过期，旧值重放才能定位并吊销原会话。
- 刷新事务按账号、会话、令牌历史的固定顺序加锁；只有当前未消费的令牌能轮换。消费旧值、写入新哈希、更新会话在同一事务完成。重放、会话过期、账号停用或版本变化均提交会话吊销后返回 10005。
- refresh Cookie 沿用登录的路径及安全属性。刷新不延长原会话的 7 天截止时间；Cookie 剩余寿命随会话截止时间缩短。失败的无效凭据清理 Cookie，不向浏览器返回旧值。
- 刷新阶段由会话 `identity_id` 决定：为空返回 10 分钟账号级令牌，否则校验身份归属、启用状态和后台身份类型后返回 30 分钟身份级令牌。组织状态检查随 T-027 接入。
- 退出通过 Cookie 定位并吊销当前会话，事务内写 `auth.logout` 审计，再清理同路径 Cookie。没有 Cookie、未知值或重复退出返回成功，且不重复记录退出审计。access 令牌按会话吊销后的请求拒绝由 T-029 AuthGuard 接入。

### 修改密码与强制改密（T-024）

- `POST /auth/change-password` 同时校验 Bearer access token 和 refresh Cookie，两者必须指向同一账号、同一会话及同一 `token_version`。完整的全局令牌守卫仍由 T-029 提供。
- 成功改密后 `token_version + 1`、`must_change_password=false`、写入 `password_changed_at`，清除失败次数和锁定时间，并写 `auth.password.change` 审计；审计只记录“密码已修改”，不记录密码或哈希。
- 当前会话保留，并把它尚未消费的 refresh 历史更新到新版本，前端随后调用 refresh 获取新 access token；同一账号的其他会话全部吊销。
- `password_history` 保存历史 argon2id 哈希。校验范围为当前密码加最近两条历史，共最近 3 次；修改成功时把原密码哈希写入历史。历史表不保存明文。
- 生产环境新密码至少 8 位、同时包含字母和数字、不能为 `123456`、不能与用户名相同、不能与最近 3 次相同。开发和测试环境允许 `123456`，但仍禁止与用户名及最近 3 次密码相同。
- `password.expire_days` 默认 0，本任务按“不启用定期改密”实现。系统参数任务接入非零配置后，登录依据 `password_changed_at` 返回 `mustChangePassword=true`。
- 生产环境随机初始密码由后续账号创建任务调用同一密码策略生成；T-024 保证生产策略本身不能接受 `123456`。
