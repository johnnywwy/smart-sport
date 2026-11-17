import {
  systemParamDefinitions,
  systemParamSchema,
} from "@smart-sport/contracts";
import type { IdentityContext } from "../identity-context/index.js";
import type { ParamRow } from "./params.repository.js";
export function paramResponse(row: ParamRow, actor: IdentityContext) {
  const d = systemParamDefinitions.find((d) => d.key === row.key);
  if (!d) throw new Error("系统参数目录缺失");
  return systemParamSchema.parse({
    id: row.id,
    key: row.key,
    name: d.name,
    value: row.value,
    defaultValue: d.defaultValue,
    min: d.min,
    max: d.max,
    unit: d.unit,
    remark: d.remark,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    allowedActions: actor.permissions.has("system:param:update")
      ? ["update"]
      : [],
  });
}
