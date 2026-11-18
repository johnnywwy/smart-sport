import type { TableRecord } from "../types";
/** 集合将组尾边界规范化为下一行之前时，仍将放置目标还原到原分组内。 */
export function tableDropDestination<T extends TableRecord>(
  rows: readonly T[],
  source: T,
  target: T,
  position: "before" | "after",
  canDrop: (source: T, target: T) => boolean,
) {
  if (canDrop(source, target)) return { item: target, position };
  const index = rows.findIndex((row) => row.id === target.id);
  const adjacent = rows[index + (position === "before" ? -1 : 1)];
  if (adjacent && canDrop(source, adjacent))
    return {
      item: adjacent,
      position:
        position === "before" ? ("after" as const) : ("before" as const),
    };
  return null;
}
