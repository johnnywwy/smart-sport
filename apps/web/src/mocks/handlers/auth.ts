import {
  changePasswordRequestSchema,
  emptyResultSchema,
  loginRequestSchema,
  loginResponseSchema,
} from "@smart-sport/contracts";
import {
  authExamples,
  authMockScenarios,
} from "@smart-sport/contracts/examples/auth";
import { http } from "msw/http";
import { invalidMockRequest, mockResponse } from "../response";

export function createAuthMocks(origin: string) {
  // 只模拟当前页面内的会话与展示场景，不模拟 Cookie 安全策略或真实权限。
  let loggedIn = false;
  let password = authExamples.login.password;
  let captchaIssued = false;
  let passwordChanged = false;
  const url = (path: string) => new URL(`/api/v1/auth/${path}`, origin).href;
  return [
    {
      path: "/api/v1/auth/captcha",
      handler: http.get(url("captcha"), () => {
        captchaIssued = true;
        return mockResponse(200, 0, "ok", authExamples.captcha);
      }),
    },
    {
      path: "/api/v1/auth/login",
      handler: http.post(url("login"), async ({ request }) => {
        const parsed = loginRequestSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) return invalidMockRequest();
        const {
          account,
          password: inputPassword,
          captchaId,
          captchaCode,
        } = parsed.data;
        if (account === authMockScenarios.locked)
          return mockResponse(401, 10003, "账号已锁定，请稍后再试");
        if (account === authMockScenarios.disabled)
          return mockResponse(401, 10004, "账号已停用");
        if (account === authMockScenarios.captcha) {
          if (
            !captchaIssued ||
            captchaId !== authExamples.captcha.captchaId ||
            captchaCode !== "2468"
          )
            return mockResponse(401, 10002, "需要图形验证码 / 验证码错误");
          captchaIssued = false;
        }
        if (
          !(Object.values(authMockScenarios) as readonly string[]).includes(
            account,
          ) ||
          inputPassword !== password
        )
          return mockResponse(401, 10001, "账号或密码错误");
        loggedIn = true;
        return mockResponse(
          200,
          0,
          "ok",
          loginResponseSchema.parse({
            ...authExamples.loggedIn,
            mustChangePassword:
              account === authMockScenarios.changePassword && !passwordChanged,
          }),
        );
      }),
    },
    {
      path: "/api/v1/auth/refresh",
      handler: http.post(url("refresh"), () =>
        loggedIn
          ? mockResponse(200, 0, "ok", authExamples.refreshed)
          : mockResponse(401, 10005, "登录已过期，请重新登录"),
      ),
    },
    {
      path: "/api/v1/auth/logout",
      handler: http.post(url("logout"), () => {
        loggedIn = false;
        return mockResponse(200, 0, "ok", emptyResultSchema.parse(null));
      }),
    },
    {
      path: "/api/v1/auth/change-password",
      handler: http.post(url("change-password"), async ({ request }) => {
        const authorization = request.headers.get("Authorization");
        if (
          !loggedIn ||
          (authorization !== `Bearer ${authExamples.loggedIn.accessToken}` &&
            authorization !== `Bearer ${authExamples.refreshed.accessToken}`)
        )
          return mockResponse(401, 10005, "登录已过期，请重新登录");
        const parsed = changePasswordRequestSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) return invalidMockRequest();
        if (parsed.data.oldPassword !== password)
          return mockResponse(401, 10001, "账号或密码错误");
        password = parsed.data.newPassword;
        passwordChanged = true;
        return mockResponse(200, 0, "ok", emptyResultSchema.parse(null));
      }),
    },
  ];
}
