import { expect, it } from "vitest";
import { tableDropDestination } from "./table-reorder-state";

const rows = [
  { id: "previous", group: "other", allowedActions: ["update"] },
  { id: "first", group: "same", allowedActions: ["update"] },
  { id: "source", group: "same", allowedActions: ["update"] },
  { id: "last", group: "same", allowedActions: ["update"] },
  { id: "next", group: "next", allowedActions: ["update"] },
  { id: "deep", group: "next", allowedActions: ["update"] },
];
const [previous, first, source, last, next, deep] = rows;
if (!previous || !first || !source || !last || !next || !deep)
  throw new Error("缺少测试行");
const canDrop = (a: typeof source, b: typeof source) =>
  a.id !== b.id && a.group === b.group;
it("分组首尾边界还原到本组，不能跨到其他分组内部", () => {
  expect(
    tableDropDestination(rows, source, previous, "after", canDrop),
  ).toEqual({ item: first, position: "before" });
  expect(tableDropDestination(rows, source, next, "before", canDrop)).toEqual({
    item: last,
    position: "after",
  });
  expect(
    tableDropDestination(rows, source, deep, "before", canDrop),
  ).toBeNull();
  expect(tableDropDestination(rows, source, next, "after", canDrop)).toBeNull();
  expect(tableDropDestination(rows, source, last, "before", canDrop)).toEqual({
    item: last,
    position: "before",
  });
});
