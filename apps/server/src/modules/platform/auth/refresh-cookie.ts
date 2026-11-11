import type { ServerResponse } from "node:http";

export function readRefreshCookie(
  header: string | undefined,
): string | undefined {
  const matches = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("refresh_token="));
  if (matches.length !== 1) return undefined;
  const value = matches[0]?.slice("refresh_token=".length);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export function writeRefreshCookie(
  response: ServerResponse,
  token: string | null,
  production: boolean,
  maxAge = 604800,
) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Set-Cookie",
    `refresh_token=${token ?? ""}; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=${token ? maxAge : 0}${production ? "; Secure" : ""}`,
  );
}
