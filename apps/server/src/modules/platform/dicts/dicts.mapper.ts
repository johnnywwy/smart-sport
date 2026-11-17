import { dictItemSchema } from "@smart-sport/contracts";
import type { IdentityContext } from "../identity-context/index.js";
import type { DictItemRow } from "./dicts.repository.js";
export function dictItemResponse(row: DictItemRow, actor: IdentityContext) {
  const allowedActions: ("update" | "delete")[] = [];
  if (!row.isSystem && actor.identityType === "company") {
    if (actor.permissions.has("system:dict:update"))
      allowedActions.push("update");
    if (!row.usedAt && actor.permissions.has("system:dict:delete"))
      allowedActions.push("delete");
  }
  return dictItemSchema.parse({
    used: row.usedAt !== null,
    allowedActions,
    // 显式选字段，避免将数据库公共字段直接暴露为接口。
    id: row.id,
    typeCode: row.typeCode,
    value: row.value,
    label: row.label,
    description: row.description,
    sort: row.sort,
    enabled: row.enabled,
    isSystem: row.isSystem,
    version: row.version,
  });
}
