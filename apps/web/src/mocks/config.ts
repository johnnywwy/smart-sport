export function parseMockPrefixes(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "false") return [];
  if (trimmed === "true") return ["/api/v1"];
  const prefixes = trimmed
    .split(",")
    .map((prefix) => prefix.trim().replace(/\/$/, ""));
  if (prefixes.some((prefix) => !/^\/api\/v1(?:\/[a-z0-9-]+)*$/.test(prefix))) {
    throw new Error(
      "VITE_MOCK 需要填写 /api/v1 下的接口前缀，多个前缀用逗号分隔",
    );
  }
  return [...new Set(prefixes)];
}

export function isMockedPath(path: string, prefixes: readonly string[]) {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
