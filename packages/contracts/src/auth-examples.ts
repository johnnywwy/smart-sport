import {
  captchaResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  refreshAccessTokenSchema,
} from "./auth.js";

// 仅用于契约示例与开发 Mock，不是可用于真实后端的凭据或令牌。
export const authExamples = {
  login: loginRequestSchema.parse({ account: "demo", password: "123456" }),
  loggedIn: loginResponseSchema.parse({
    accessToken: "mock-account-access",
    mustChangePassword: false,
    identityCount: 2,
    selectedIdentity: null,
  }),
  refreshed: refreshAccessTokenSchema.parse({
    accessToken: "mock-refreshed-access",
  }),
  captcha: captchaResponseSchema.parse({
    captchaId: "mock-captcha",
    image:
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="48"><rect width="140" height="48" fill="white"/><text x="20" y="33" font-size="28" fill="black">2468</text></svg>',
      ),
  }),
};
export const authMockScenarios = {
  normal: "demo",
  captcha: "demo-captcha",
  locked: "demo-locked",
  disabled: "demo-disabled",
  changePassword: "demo-change-password",
} as const;
