import { z } from "zod";

// refresh 的令牌阶段由服务端会话决定，客户端不自行推断身份。
export const refreshAccessTokenSchema = z.object({
  accessToken: z.string().min(1),
});
export type RefreshAccessToken = z.infer<typeof refreshAccessTokenSchema>;

