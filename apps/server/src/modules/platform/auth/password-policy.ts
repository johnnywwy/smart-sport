import type { ServerConfig } from "@smart-sport/config/env";

export type PasswordPolicyFailure =
  | "不能使用默认密码"
  | "至少需要 8 个字符"
  | "必须同时包含字母和数字"
  | "不能与用户名相同"
  | "不能与最近 3 次密码相同";

export function validateNewPassword(
  config: Pick<ServerConfig, "NODE_ENV">,
  username: string,
  password: string,
): PasswordPolicyFailure[] {
  const failures: PasswordPolicyFailure[] = [];
  if (password === username) failures.push("不能与用户名相同");
  if (config.NODE_ENV === "production") {
    if (password === "123456") failures.push("不能使用默认密码");
    if (password.length < 8) failures.push("至少需要 8 个字符");
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      failures.push("必须同时包含字母和数字");
    }
  }
  return failures;
}
