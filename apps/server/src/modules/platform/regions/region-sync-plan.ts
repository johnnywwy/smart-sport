import { createHash } from "node:crypto";
import type { Region, RegionSyncChange } from "@smart-sport/contracts";
export type StoredRegion = Region & { status: number };
export type RegionReference = {
  kind: "organization" | "department" | "identity";
  id: string;
  name: string;
  code: string;
};
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** 同时覆盖旧、新上下级，防止改隶改变祖先教育局及范围的外边界。 */
export function regionSyncPlan(
  current: StoredRegion[],
  seeds: StoredRegion[],
  references: RegionReference[],
) {
  const previous = new Map(current.map((r) => [r.code, r]));
  const next = new Map(
    seeds.filter((r) => r.status === 1).map((r) => [r.code, r]),
  );
  const region = ({ status: _status, ...r }: StoredRegion): Region => r;
  const changes: RegionSyncChange[] = [];
  for (const after of next.values()) {
    const before = previous.get(after.code);
    if (before?.status !== 1)
      changes.push({
        code: after.code,
        kind: "added",
        before: before ? region(before) : null,
        after: region(after),
      });
    else if (
      before.path !== after.path ||
      before.level !== after.level ||
      before.parentCode !== after.parentCode
    )
      changes.push({
        code: after.code,
        kind: "moved",
        before: region(before),
        after: region(after),
      });
    else if (before.name !== after.name)
      changes.push({
        code: after.code,
        kind: "renamed",
        before: region(before),
        after: region(after),
      });
  }
  for (const before of current)
    if (before.status === 1 && !next.has(before.code))
      changes.push({
        code: before.code,
        kind: "retired",
        before: region(before),
        after: null,
      });
  changes.sort((a, b) => a.code.localeCompare(b.code));
  const hazardous = changes.filter(
    (c) =>
      c.kind === "retired" ||
      c.kind === "moved" ||
      (c.kind === "added" && c.before),
  );
  const impacts = references
    .filter((ref) =>
      hazardous.some((c) => {
        const paths = [c.before?.path, c.after?.path].filter(
          (p): p is string => !!p,
        );
        const own = [
          previous.get(ref.code)?.path,
          next.get(ref.code)?.path,
        ].filter((p): p is string => !!p);
        return (
          c.code === ref.code ||
          paths.some((p) =>
            own.some(
              (r) => p === r || p.startsWith(`${r}.`) || r.startsWith(`${p}.`),
            ),
          )
        );
      }),
    )
    .map((ref) => ({
      kind: ref.kind,
      name: ref.name,
      regionName:
        previous.get(ref.code)?.name ??
        next.get(ref.code)?.name ??
        "原关联区划",
    }));
  return { changes, impacts, blocked: impacts.length > 0 };
}
