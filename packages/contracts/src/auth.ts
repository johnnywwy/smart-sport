import { z } from "zod";
import { identitySummarySchema } from "./identities.js";

// refresh 的令牌阶段由服务端会话决定，客户端不自行推断身份。
export const refreshAccessTokenSchema = z.object({
  accessToken: z.string().min(1),
});
export type RefreshAccessToken = z.infer<typeof refreshAccessTokenSchema>;

export const loginRequestSchema = z.object({
  account: z.string().trim().min(1),
  password: z.string().min(1),
  captchaId: z.string().min(1).optional(),
  captchaCode: z.string().min(1).optional(),
});
export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  mustChangePassword: z.boolean(),
  identityCount: z.int().nonnegative(),
  selectedIdentity: identitySummarySchema.nullable(),
});
export const captchaResponseSchema = z.object({
  captchaId: z.string().min(1),
  image: z.string().min(1),
});
export const changePasswordRequestSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(1),
});
export const emptyResultSchema = z.null();
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
