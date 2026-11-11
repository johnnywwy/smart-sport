import {
  changePasswordRequestSchema,
  emptyResultSchema,
  identityListSchema,
  loginRequestSchema,
  loginResponseSchema,
  selectIdentityRequestSchema,
  selectIdentityResponseSchema,
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
  const identities = identityListSchema.parse({
    total: 5,
    availableCount: 4,
    groups: [
      {
        type: "company",
        typeName: "公司",
        items: [
          {
            id: "019a0000-0000-7000-8000-000000000001",
            type: "company",
            typeName: "公司员工",
            orgId: "019a0000-0000-7000-8000-000000000011",
            orgName: "智体科技",
            departmentName: "研发部",
            title: "研发人员",
            roleIds: [],
            lastUsed: true,
            available: true,
            unavailableReason: null,
          },
        ],
      },
      {
        type: "bureau",
        typeName: "教育局",
        items: [
          {
            id: "019a0000-0000-7000-8000-000000000002",
            type: "bureau",
            typeName: "教育局",
            orgId: "019a0000-0000-7000-8000-000000000012",
            orgName: "浙江省教育厅",
            departmentName: "体卫艺处",
            title: "业务科员",
            roleIds: [],
            lastUsed: false,
            available: true,
            unavailableReason: null,
          },
        ],
      },
      {
        type: "agent",
        typeName: "代理商",
        items: [
          {
            id: "019a0000-0000-7000-8000-000000000003",
            type: "agent",
            typeName: "代理商",
            orgId: "019a0000-0000-7000-8000-000000000013",
            orgName: "杭州启动体育服务",
            departmentName: "运营一部",
            title: "代理商运营",
            roleIds: [],
            lastUsed: false,
            available: true,
            unavailableReason: null,
          },
        ],
      },
      {
        type: "school",
        typeName: "学校",
        items: [
          {
            id: "019a0000-0000-7000-8000-000000000004",
            type: "school",
            typeName: "学校",
            orgId: "019a0000-0000-7000-8000-000000000014",
            orgName: "西湖第一小学",
            departmentName: null,
            title: "学校管理员",
            roleIds: [],
            lastUsed: false,
            available: true,
            unavailableReason: null,
          },
          {
            id: "019a0000-0000-7000-8000-000000000005",
            type: "teacher",
            typeName: "教师",
            orgId: "019a0000-0000-7000-8000-000000000015",
            orgName: "上城实验中学",
            departmentName: null,
            title: null,
            roleIds: [],
            lastUsed: false,
            available: false,
            unavailableReason: "暂时无法进入，请联系学校管理员",
          },
        ],
      },
    ],
  });
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
      path: "/api/v1/auth/identities",
      handler: http.get(url("identities"), () =>
        loggedIn
          ? mockResponse(200, 0, "ok", identities)
          : mockResponse(401, 10005, "登录已过期，请重新登录"),
      ),
    },
    {
      path: "/api/v1/auth/select-identity",
      handler: http.post(url("select-identity"), async ({ request }) => {
        if (!loggedIn)
          return mockResponse(401, 10005, "登录已过期，请重新登录");
        const parsed = selectIdentityRequestSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!parsed.success) return invalidMockRequest();
        const identity = identities.groups
          .flatMap((group) => group.items)
          .find((item) => item.id === parsed.data.identityId);
        if (!identity) return mockResponse(404, 11001, "身份不存在");
        if (!identity.available)
          return mockResponse(
            403,
            11002,
            identity.unavailableReason ?? "身份不可用",
          );
        return mockResponse(
          200,
          0,
          "ok",
          selectIdentityResponseSchema.parse({
            accessToken: `mock-identity-token-${identity.id}`,
            identity: { ...identity, lastUsed: true },
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
