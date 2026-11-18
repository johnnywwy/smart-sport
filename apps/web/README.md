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

## 浏览器基线

支持 Chrome / Edge 111+、Firefox 128+、Safari 16.4+。入口经典脚本优先检测实际CSS与JavaScript能力，能力足够的微信、WebView等内置浏览器可进入。无法检测时回退到版本识别，iOS微信等按系统16.4基线识别。缺少能力时跳转到 `/upgrade-browser`，不加载 React / HeroUI 主包。

旧浏览器提示只包含语义化文字和非交互布局，不使用原生交互控件，也不依赖现代 CSS 或模块脚本。新版浏览器直接访问升级页时，展示 HeroUI 卡片与官方更新链接。版本配置由 `src/shared/browser/browser-support.ts` 统一维护，构建目标也按此基线设置。

版本检测基于浏览器报告的 User-Agent，无法保证识别伪装的浏览器。测试覆盖版本边界、不同浏览器标识混用、未知浏览器及跳转防循环；浏览器冒烟检查通过 UA 模拟验证，不能替代全部最低版本真机验证。

## 开发 Mock（T-198）

MSW 默认关闭。开发前在 `apps/web/.env.local` 配置 `VITE_MOCK=/api/v1/auth`，即可模拟认证接口。也可设置逗号分隔的具体路径，例如 `VITE_MOCK=/api/v1/auth/login,/api/v1/auth/captcha`；未选中的接口继续访问真实后端。改为 `false` 并重新打开页面后关闭。不要把真实凭据放入任何 `VITE_*` 配置。

首次启用时，入口会等待 Service Worker 就绪再加载页面。官方 MSW Vite 插件只在开发服务器提供 worker；生产构建不启用插件，也不加载 Mock 模块。无需生成或提交 `public/mockServiceWorker.js`。

| 场景       | 示例账号               | 说明                                          |
| ---------- | ---------------------- | --------------------------------------------- |
| 正常登录   | `demo`                 | 默认密码 `123456`                             |
| 需要验证码 | `demo-captcha`         | 先获取验证码，示例验证码为 `2468`，使用后失效 |
| 账号锁定   | `demo-locked`          | 返回 10003                                    |
| 账号停用   | `demo-disabled`        | 返回 10004                                    |
| 首次改密   | `demo-change-password` | 返回 `mustChangePassword=true`                |

请求、响应与示例数据来自 contracts。Mock 响应包含 `X-Mock-Response: true`，启动时仅输出一行启用范围，不打印请求体、密码和令牌。

这些是供页面开发的固定场景；不实现真实密码哈希、失败次数锁定、HttpOnly Cookie、权限校验或审计。会话与示例改密只保留在当前页面内存，刷新页面重置。它们不能作为后端安全验收结果。真实接口就绪后删除对应处理器并关闭该路径的 Mock。
