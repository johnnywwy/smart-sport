import { expect, it } from "vitest";
import {
  regionSyncPlan,
  type StoredRegion,
} from "../../src/modules/platform/regions/region-sync-plan.js";

const a: StoredRegion = {
  code: "330000",
  name: "浙江省",
  level: 1,
  parentCode: null,
  path: "330000",
  status: 1,
};
const b: StoredRegion = {
  code: "330100",
  name: "杭州市",
  level: 2,
  parentCode: a.code,
  path: "330000.330100",
  status: 1,
};
it("同码改名不迁移关联，无变更不产生计划", () => {
  expect(regionSyncPlan([a, b], [a, b], [])).toEqual({
    changes: [],
    impacts: [],
    blocked: false,
  });
  expect(
    regionSyncPlan(
      [a, b],
      [a, { ...b, name: "新名称" }],
      [{ kind: "organization", id: "s", name: "学校", code: b.code }],
    ),
  ).toMatchObject({ changes: [{ kind: "renamed" }], blocked: false });
});
it("撤销阻止组织、上级负责范围受影响；不引用的旧码可停用而非物理删除", () => {
  expect(
    regionSyncPlan(
      [a, b],
      [a],
      [{ kind: "department", id: "d", name: "省负责组", code: a.code }],
    ),
  ).toMatchObject({ blocked: true, impacts: [{ name: "省负责组" }] });
  expect(regionSyncPlan([a, b], [a], [])).toMatchObject({
    changes: [{ kind: "retired", before: { code: b.code }, after: null }],
    blocked: false,
  });
});
it("改隶同时检查新旧祖先，重新启用旧码也检查历史关联", () => {
  const c: StoredRegion = {
    code: "340000",
    name: "安徽省",
    level: 1,
    parentCode: null,
    path: "340000",
    status: 1,
  };
  expect(
    regionSyncPlan(
      [a, b, c],
      [a, { ...b, parentCode: c.code, path: `${c.code}.${b.code}` }, c],
      [{ kind: "identity", id: "i", name: "省负责人员", code: c.code }],
    ),
  ).toMatchObject({ changes: [{ kind: "moved" }], blocked: true });
  expect(
    regionSyncPlan(
      [a, { ...b, status: 0 }],
      [a, b],
      [{ kind: "organization", id: "s", name: "历史学校", code: b.code }],
    ),
  ).toMatchObject({ blocked: true });
});
