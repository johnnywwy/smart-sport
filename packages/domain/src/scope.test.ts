import type { SchoolSelection } from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import { mergePermissions } from "./permissions.js";
import { calculateVisibleScope, type ScopeInput } from "./scope.js";

const base: ScopeInput = {
  identity: { type: "company", boundary: { kind: "all-schools" } },
  option: "personal",
  hasDepartment: true,
  department: [{ kind: "schools", schoolIds: ["a"] }],
  departmentAndBelow: [{ kind: "schools", schoolIds: ["a", "b"] }],
  extra: [{ kind: "schools", schoolIds: ["c", "c"] }],
};
const school = (part: Partial<SchoolSelection> = {}): SchoolSelection => ({
  kind: "school",
  schoolId: "s",
  ...part,
});

describe("visible scope boundaries", () => {
  it.each(["company", "bureau", "agent"] as const)(
    "restricts expanded scopes for %s",
    (type) => {
      const input: ScopeInput = {
        ...base,
        option: "dept_and_below",
        identity: {
          type,
          boundary: { kind: "schools", schoolIds: ["b", "c"] },
        },
      };
      expect(calculateVisibleScope(input)).toEqual({
        kind: "schools",
        schoolIds: ["b", "c"],
      });
      expect(calculateVisibleScope({ ...input, option: "all" })).toEqual({
        kind: "schools",
        schoolIds: ["b", "c"],
      });
    },
  );
  it("unions personal scopes and expands only the requested department level", () => {
    expect(calculateVisibleScope(base)).toEqual({
      kind: "schools",
      schoolIds: ["c"],
    });
    expect(calculateVisibleScope({ ...base, option: "dept" })).toEqual({
      kind: "schools",
      schoolIds: ["a", "c"],
    });
    expect(
      calculateVisibleScope({ ...base, option: "dept_and_below" }),
    ).toEqual({ kind: "schools", schoolIds: ["a", "b", "c"] });
    expect(calculateVisibleScope({ ...base, option: "all" })).toEqual({
      kind: "all-schools",
    });
  });
  it("immediately drops a revoked school from an agent boundary", () => {
    const input: ScopeInput = {
      ...base,
      option: "dept_and_below",
      identity: {
        type: "agent",
        boundary: { kind: "schools", schoolIds: ["a", "b"] },
      },
    };
    expect(calculateVisibleScope(input)).toEqual({
      kind: "schools",
      schoolIds: ["a", "b"],
    });
    expect(
      calculateVisibleScope({
        ...input,
        identity: {
          type: "agent",
          boundary: { kind: "schools", schoolIds: ["b"] },
        },
      }),
    ).toEqual({ kind: "schools", schoolIds: ["b"] });
  });
  it.each(["school", "teacher"] as const)(
    "keeps %s selections within its own school",
    (type) => {
      const input: ScopeInput = {
        ...base,
        option: "dept",
        identity: { type, schoolId: "s" },
        department: [school({ grades: [23] }), school({ schoolId: "other" })],
        extra: [school({ classIds: ["c", "c"], collegeIds: ["college"] })],
      };
      expect(calculateVisibleScope(input)).toEqual(
        school({ grades: [23], classIds: ["c"], collegeIds: ["college"] }),
      );
      expect(calculateVisibleScope({ ...input, option: "all" })).toEqual(
        school(),
      );
    },
  );
  it("adds only the supplied current-term teaching scope to teacher personal responsibility", () => {
    const input: ScopeInput = {
      ...base,
      identity: {
        type: "teacher",
        schoolId: "s",
        teaching: school({ classIds: ["administrative", "teaching"] }),
      },
      extra: [school({ grades: [23] })],
    };
    expect(calculateVisibleScope(input)).toEqual(
      school({
        grades: [23],
        classIds: ["administrative", "teaching"],
        collegeIds: [],
      }),
    );
    expect(
      calculateVisibleScope({
        ...input,
        identity: {
          type: "teacher",
          schoolId: "s",
          teaching: school({ classIds: ["historical"] }),
        },
      }),
    ).toEqual(
      school({ grades: [23], classIds: ["historical"], collegeIds: [] }),
    );
    expect(
      calculateVisibleScope({
        ...input,
        identity: { type: "school", schoolId: "s" },
      }),
    ).toEqual(school({ grades: [23], classIds: [], collegeIds: [] }));
  });
  it("represents an empty school scope explicitly and full school responsibility without filters", () => {
    const input: ScopeInput = {
      ...base,
      identity: { type: "school", schoolId: "s" },
      extra: [],
    };
    expect(calculateVisibleScope(input)).toEqual(
      school({ grades: [], classIds: [], collegeIds: [] }),
    );
    expect(calculateVisibleScope({ ...input, extra: [school()] })).toEqual(
      school(),
    );
  });
  it("keeps student and parent scopes fixed", () => {
    expect(
      calculateVisibleScope({
        ...base,
        identity: { type: "student", studentId: "me" },
      }),
    ).toEqual({ kind: "self", studentId: "me" });
    expect(
      calculateVisibleScope({
        ...base,
        identity: { type: "parent", studentIds: ["b", "a", "b"] },
      }),
    ).toEqual({ kind: "children", studentIds: ["a", "b"] });
  });
  it("does not grant personal extras without a permission or missing required department", () => {
    expect(calculateVisibleScope({ ...base, option: undefined })).toEqual({
      kind: "schools",
      schoolIds: [],
    });
    for (const option of ["dept", "dept_and_below"] as const) {
      expect(
        calculateVisibleScope({ ...base, option, hasDepartment: false }),
      ).toEqual({ kind: "schools", schoolIds: [] });
    }
  });
  it("uses the requested permission's scope rather than the widest identity-wide scope", () => {
    const feature = {
      app: "school",
      feature: "student",
      actions: ["view", "update"] as ("view" | "update")[],
    };
    const permissions = mergePermissions([
      { feature, grant: { level: "view" }, scope: "all" },
      { feature, grant: { level: "edit" }, scope: "dept" },
    ]);
    expect(
      calculateVisibleScope({
        ...base,
        option: permissions.get("school:student:view"),
      }),
    ).toEqual({ kind: "all-schools" });
    expect(
      calculateVisibleScope({
        ...base,
        option: permissions.get("school:student:update"),
      }),
    ).toEqual({ kind: "schools", schoolIds: ["a", "c"] });
    expect(
      calculateVisibleScope({
        ...base,
        option: permissions.get("school:student:delete"),
      }),
    ).toEqual({ kind: "schools", schoolIds: [] });
  });
  it("does not mutate inputs or share result arrays", () => {
    const input = structuredClone(base);
    const snapshot = structuredClone(input);
    const result = calculateVisibleScope(input);
    if (result.kind === "schools") result.schoolIds.push("outside");
    expect(input).toEqual(snapshot);
    expect(calculateVisibleScope(input)).toEqual({
      kind: "schools",
      schoolIds: ["c"],
    });
  });
});
