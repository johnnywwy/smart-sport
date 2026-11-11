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

| 令牌          | 有效期  | 内容                                   | 可调用                                        |
| ------------- | ------- | -------------------------------------- | --------------------------------------------- |
| 账号级 access | 10 分钟 | `sub, tv, client, stage=account`       | 仅 spec 02 的“列出身份”“选择身份”、改密、退出 |
| 身份级 access | 30 分钟 | `sub, iid, tv, client, stage=identity` | 全部业务接口                                  |
| refresh       | 7 天    | 随机串，库中存哈希                     | 刷新接口；每次刷新轮换                        |

- 签名算法 EdDSA（jose），密钥由环境注入，支持多密钥轮换（`kid`）。
- refresh token 放 HttpOnly + Secure + SameSite=Strict Cookie，路径 `/api/v1/auth/refresh`；access token 放内存。

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
