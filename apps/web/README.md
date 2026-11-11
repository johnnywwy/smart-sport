# Web 开发

开发使用 `pnpm dev`，`/api` 与 `/health` 代理到本机 3000 端口。界面预览位于 `/preview/portal`，示例数据不代表已接入业务接口。

## API 客户端

功能 hook 从 `shared/api/client.ts` 导入 `apiClient`，调用 `request('/api/v1/...', responseDataSchema, options)`，响应数据 schema 来自 `@smart-sport/contracts`。返回值为校验后的 `data`；错误为 `ApiError`，字段校验信息通过 `error.fields` 获取。

- 受保护请求默认注入内存中的 access token；登录等公共接口显式传入 `auth: false`。
- 登录或选择身份成功后调用 `useSession.getState().startSession(accessToken)`；刷新页面可调用 `apiClient.refresh()` 恢复 Cookie 对应的会话。预览页不主动恢复登录。
- 普通 401 共用刷新请求，每个原请求最多重试一次。刷新失败或重试仍为 401 时清除会话，导航到 `/login`。11005 恢复当前身份并导航到 `/portal`，不重放原操作。
- 表单打开时调用 `createIdempotencyKey()` 并保留到本次表单关闭，提交时传入 `idempotencyKey`。自动生成的 POST 键仅保证本次请求及其刷新重试复用；其他需要幂等的提交也须显式传入。
- 请求支持 `signal`，默认超时 15 秒。字段错误由表单处理时可传入 `notify: false`。
- 身份切换、登录和退出使旧请求失效，并清空 TanStack Query 缓存。令牌不持久化。

## 发布版本

构建环境通过 `APP_VERSION` 注入公开发布版本，默认 `0.0.0`。它需要与后端响应头 `X-App-Version` 使用同一个版本。客户端发现不一致后显示 HeroUI 刷新提示，用户确认后刷新页面。

## 验证与联调边界

`pnpm --filter @smart-sport/web test` 运行 API 与状态单元测试。刷新流程目前通过测试响应验证；真实刷新接口、登录表单和身份门户路由由后续认证切片接入，当前不会将这些任务标为完成。

