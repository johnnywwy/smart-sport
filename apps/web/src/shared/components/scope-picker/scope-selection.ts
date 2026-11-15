import { extraScopesSchema, type ScopeOption } from "@smart-sport/contracts";

export const scopeKey = (item: Pick<ScopeOption, "type" | "value">) =>
  `${item.type}:${item.value}`;

/** 只沿真实返回的父级关系判断包含，不从区划码生成未授权节点。 */
export function coveringRegion(
  item: ScopeOption,
  selected: readonly ScopeOption[],
  options: readonly ScopeOption[],
) {
  const regions = new Map(
    [...options, ...selected]
      .filter((entry) => entry.type === "region")
      .map((entry) => [entry.value, entry]),
  );
  const seen = new Set<string>();
  let parent = item.parentValue;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const ancestor = selected.find(
      (entry) =>
        entry.type === "region" && entry.value === parent && entry.available,
    );
    if (ancestor) return ancestor;
    parent = regions.get(parent)?.parentValue ?? null;
  }
  return undefined;
}

export function toggleScope(
  selected: readonly ScopeOption[],
  item: ScopeOption,
  checked: boolean,
  disabled = false,
): ScopeOption[] {
  if (disabled || (checked && !item.available)) return [...selected];
  const remaining = selected.filter(
    (entry) => scopeKey(entry) !== scopeKey(item),
  );
  return checked ? [...remaining, item] : remaining;
}

/** 展示字段不进入保存体，格式和重复项仍由共享契约校验。 */
export const scopeValues = (selected: readonly ScopeOption[]) =>
  extraScopesSchema.parse(selected.map(({ type, value }) => ({ type, value })));

export function selectionCounts(selected: readonly ScopeOption[]) {
  const distinct = [
    ...new Map(selected.map((item) => [scopeKey(item), item])).values(),
  ];
  return {
    regions: distinct.filter((item) => item.type === "region").length,
    schools: distinct.filter((item) => item.type === "school").length,
    unavailable: distinct.filter((item) => !item.available).length,
  };
}
