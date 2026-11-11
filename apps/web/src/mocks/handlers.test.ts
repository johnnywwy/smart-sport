import {
  captchaResponseSchema,
  emptyResultSchema,
  identityListSchema,
  loginResponseSchema,
  refreshAccessTokenSchema,
  responseSchema,
  selectIdentityResponseSchema,
} from "@smart-sport/contracts";
import {
  authExamples,
  authMockScenarios,
} from "@smart-sport/contracts/examples/auth";
import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMockHandlers } from "./handlers";

const origin = "http://smart-sport.test";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() =>
  server.resetHandlers(...createMockHandlers(["/api/v1/auth"], origin)),
);
afterAll(() => server.close());
const post = (endpoint: string, body?: unknown, token?: string) =>
  fetch(`${origin}/api/v1/auth/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const login = (account: string = authMockScenarios.normal) =>
  post("login", { ...authExamples.login, account });

describe("按契约模拟认证接口", () => {
  it("登录成功响应通过契约校验，附带 Mock 标记", async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Mock-Response")).toBe("true");
    expect(response.headers.get("X-App-Version")).toBe(__APP_VERSION__);
    expect(
      responseSchema(loginResponseSchema).parse(await response.json()),
    ).toMatchObject({ code: 0, data: authExamples.loggedIn });
  });
  it("账号不存在与密码错误都返回相同错误", async () => {
    for (const body of [
      { account: "unknown", password: "123456" },
      { account: "demo", password: "wrong" },
    ]) {
      const response = await post("login", body);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        code: 10001,
        message: "账号或密码错误",
        data: null,
      });
    }
  });
  it.each([
    [authMockScenarios.locked, 10003],
    [authMockScenarios.disabled, 10004],
  ])("场景 %s 返回 %s", async (account, code) =>
    expect(await (await login(account)).json()).toMatchObject({ code }),
  );
  it("支持首次改密场景", async () =>
    expect(
      await (await login(authMockScenarios.changePassword)).json(),
    ).toMatchObject({ data: { mustChangePassword: true } }));
  it("验证码场景要求先获取验证码并提供正确输入", async () => {
    expect(await (await login(authMockScenarios.captcha)).json()).toMatchObject(
      { code: 10002 },
    );
    const captcha = await fetch(`${origin}/api/v1/auth/captcha`);
    expect(
      responseSchema(captchaResponseSchema).parse(await captcha.json()),
    ).toMatchObject({ code: 0, data: authExamples.captcha });
    const body = {
      ...authExamples.login,
      account: authMockScenarios.captcha,
      captchaId: authExamples.captcha.captchaId,
      captchaCode: "2468",
    };
    expect((await post("login", body)).status).toBe(200);
    expect(await (await post("login", body)).json()).toMatchObject({
      code: 10002,
    });
  });
  it("未登录不能刷新；登录后可刷新；退出后再次失效", async () => {
    expect(await (await post("refresh")).json()).toMatchObject({ code: 10005 });
    await login();
    expect(
      responseSchema(refreshAccessTokenSchema).parse(
        await (await post("refresh")).json(),
      ),
    ).toMatchObject({ code: 0, data: authExamples.refreshed });
    expect(
      responseSchema(emptyResultSchema).parse(
        await (await post("logout")).json(),
      ),
    ).toMatchObject({ code: 0, data: null });
    expect(await (await post("refresh")).json()).toMatchObject({ code: 10005 });
  });
  it("改密须登录并携带模拟令牌", async () => {
    const body = { oldPassword: "123456", newPassword: "new-demo-password" };
    expect((await post("change-password", body)).status).toBe(401);
    await login();
    expect((await post("change-password", body, "wrong-token")).status).toBe(
      401,
    );
    expect(
      (await post("change-password", body, authExamples.loggedIn.accessToken))
        .status,
    ).toBe(200);
    expect(
      (await post("login", { account: "demo", password: body.newPassword }))
        .status,
    ).toBe(200);
  });
  it("登录后可列出身份并选择可用身份", async () => {
    await login();
    const listResponse = await fetch(`${origin}/api/v1/auth/identities`);
    const listEnvelope = responseSchema(identityListSchema).parse(
      await listResponse.json(),
    );
    const list = identityListSchema.parse(listEnvelope.data);
    expect(list).toMatchObject({ total: 5, availableCount: 4 });
    const identityId = list.groups[0]?.items[0]?.id;
    const response = await post("select-identity", { identityId });
    expect(response.status).toBe(200);
    const selectedEnvelope = responseSchema(selectIdentityResponseSchema).parse(
      await response.json(),
    );
    expect(
      selectIdentityResponseSchema.parse(selectedEnvelope.data).identity,
    ).toMatchObject({ orgName: "智体科技", lastUsed: true });
  });
  it("不可用身份不能选择", async () => {
    await login();
    const response = await post("select-identity", {
      identityId: "019a0000-0000-7000-8000-000000000005",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 11002 });
  });
  it("不合法请求返回 90001 与字段错误", async () => {
    const response = await post("login", { account: "", password: "" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 90001,
      data: { fields: { _request: ["请求格式不正确"] } },
    });
  });
  it("单接口开关只拦截对应请求，其他接口继续交给后端", async () => {
    const fallback = http.post(`${origin}/api/v1/auth/login`, () =>
      HttpResponse.json({ source: "backend" }),
    );
    server.resetHandlers(
      ...createMockHandlers(["/api/v1/auth/captcha"], origin),
      fallback,
    );
    expect(await (await login()).json()).toEqual({ source: "backend" });
    expect(
      (await fetch(`${origin}/api/v1/auth/captcha`)).headers.get(
        "X-Mock-Response",
      ),
    ).toBe("true");
  });
  it("不会拦截其他来源上的同名接口", async () => {
    server.use(
      http.post("https://other.test/api/v1/auth/login", () =>
        HttpResponse.json({ source: "other" }),
      ),
    );
    expect(
      await (
        await fetch("https://other.test/api/v1/auth/login", { method: "POST" })
      ).json(),
    ).toEqual({ source: "other" });
  });
});
