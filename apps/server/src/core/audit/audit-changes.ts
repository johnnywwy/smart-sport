import { isDeepStrictEqual } from "node:util";

const sensitiveFields = new Set([
  "password",
  "passwordhash",
  "newpassword",
  "oldpassword",
  "currentpassword",
  "phone",
  "phonehash",
  "phoneciphertext",
  "phoneencrypted",
  "email",
  "mobile",
  "contactphone",
  "idcard",
  "idcardnumber",
  "idcardhash",
  "idcardciphertext",
  "idnumber",
  "identitynumber",
  "documentnumber",
  "certificatenumber",
  "token",
  "accesstoken",
  "refreshtoken",
  "tokenhash",
  "authorization",
  "secret",
  "encryptionkey",
  "hmackey",
]);
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
function sensitive(field: string) {
  return sensitiveFields.has(field.replace(/[_-]/g, "").toLowerCase());
}
function sanitize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (!record(value)) return value ?? null;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitive(key) ? "已修改" : sanitize(entry),
    ]),
  );
}

/** 将整对象快照转换为字段差异；上下文说明保留，敏感字段不保存前后值。 */
export function auditChanges(value: unknown): unknown {
  if (!record(value)) return sanitize(value);
  const { before, after, ...context } = value;
  if (
    !("before" in value) ||
    !("after" in value) ||
    (before != null && !record(before)) ||
    (after != null && !record(after))
  ) {
    return sanitize(value);
  }
  const previous = before ?? {};
  const next = after ?? {};
  const changes: [string, unknown][] = [];
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const oldValue = Object.hasOwn(previous, key)
      ? (previous[key] ?? null)
      : null;
    const newValue = Object.hasOwn(next, key) ? (next[key] ?? null) : null;
    if (!isDeepStrictEqual(oldValue, newValue)) {
      changes.push([
        key,
        sensitive(key) ? "已修改" : [sanitize(oldValue), sanitize(newValue)],
      ]);
    }
  }
  // 元信息放在字段差异之后，避免菜单 key、修改原因等说明被丢弃。
  return {
    ...Object.fromEntries(changes),
    ...(sanitize(context) as Record<string, unknown>),
  };
}
