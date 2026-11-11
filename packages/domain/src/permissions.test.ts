import type {
  Action,
  DataScopeOption,
  FeatureDefinition,
  FeatureGrant,
} from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import {
  diffRoleGrants,
  expandGrant,
  hasPermission,
  mergePermissions,
  resolveRoleGrants,
} from "./permissions.js";

const feature: FeatureDefinition = {
  app: "school",
  feature: "student",
  actions: [
    "view",
    "create",
    "update",
    "delete",
    "import",
    "export",
    "approve",
    "sensitive",
  ],
};
const code = (action: string) => `school:student:${action}`;

describe("permission expansion", () => {
  it.each([
    ["none", []],
    ["view", ["view"]],
    ["edit", ["view", "create", "update"]],
    ["manage", feature.actions],
  ] as const)("expands %s", (level, actions) => {
    expect(expandGrant(feature, { level })).toEqual(actions.map(code));
  });
  it("expands only actions declared by the feature", () => {
    expect(
      expandGrant(
        { ...feature, actions: ["view", "update"] },
        { level: "edit" },
      ),
    ).toEqual([code("view"), code("update")]);
    expect(
      expandGrant(
        { ...feature, actions: ["view", "update"] },
        { level: "custom", actions: ["sensitive", "update", "update"] },
      ),
    ).toEqual([code("update")]);
  });
  it("supports explicit custom subsets and empty selections", () => {
    expect(
      expandGrant(feature, {
        level: "custom",
        actions: ["sensitive", "approve"],
      }),
    ).toEqual([code("approve"), code("sensitive")]);
    expect(expandGrant(feature, { level: "custom", actions: [] })).toEqual([]);
  });
  it("never implies view permission from a custom write action", () => {
    expect(
      expandGrant(feature, { level: "custom", actions: ["update"] }),
    ).toEqual([code("update")]);
  });
  it("rejects malformed features and grants", () => {
    expect(() =>
      expandGrant({ ...feature, app: "school:*" }, { level: "manage" }),
    ).toThrow();
    expect(() =>
      expandGrant(feature, { level: "invalid" } as unknown as FeatureGrant),
    ).toThrow();
    expect(() =>
      expandGrant(feature, { level: "custom" } as FeatureGrant),
    ).toThrow();
  });
});

describe("role grant inheritance", () => {
  const base = [
    { app: "school", feature: "student", grant: { level: "view" } as const },
    { app: "school", feature: "teacher", grant: { level: "edit" } as const },
  ];
  it("inherits unadjusted features and applies only explicit overrides", () => {
    expect(
      resolveRoleGrants(base, [
        {
          app: "school",
          feature: "student",
          grant: { level: "manage" },
        },
      ]),
    ).toEqual([
      { app: "school", feature: "student", grant: { level: "manage" } },
      { app: "school", feature: "teacher", grant: { level: "edit" } },
    ]);
  });
  it("new base features automatically appear in custom roles", () => {
    expect(
      resolveRoleGrants(
        [
          ...base,
          { app: "school", feature: "class", grant: { level: "view" } },
        ],
        [],
      ),
    ).toContainEqual({
      app: "school",
      feature: "class",
      grant: { level: "view" },
    });
  });
  it("stores only differences and compares custom action sets without order", () => {
    const submitted = [
      ...base,
      {
        app: "school",
        feature: "class",
        grant: {
          level: "custom" as const,
          actions: ["update", "view"] as Action[],
        },
      },
    ];
    expect(
      diffRoleGrants(
        [
          ...base,
          {
            app: "school",
            feature: "class",
            grant: { level: "custom", actions: ["view", "update"] },
          },
        ],
        submitted,
      ),
    ).toEqual([]);
    expect(diffRoleGrants(base, submitted)).toEqual([submitted[2]]);
  });
});

describe("per-permission role scopes", () => {
  const entry = (level: FeatureGrant, scope: DataScopeOption) => ({
    feature,
    grant: level,
    scope,
  });
  it("does not expand editing to the wider viewing scope", () => {
    const grants = [
      entry({ level: "view" }, "all"),
      entry({ level: "edit" }, "dept"),
    ];
    const permissions = mergePermissions(grants);
    expect(permissions.get("school:student:view")).toBe("all");
    expect(permissions.get("school:student:update")).toBe("dept");
    expect(permissions.has("school:student:delete")).toBe(false);
    expect([...mergePermissions([...grants].reverse())]).toEqual([
      ...permissions,
    ]);
  });
  it.each(["personal", "dept", "dept_and_below", "all"] as const)(
    "takes the widest participating scope through %s",
    (scope) => {
      const permissions = mergePermissions([
        entry({ level: "view" }, scope),
        entry({ level: "view" }, "personal"),
      ]);
      expect(permissions.get("school:student:view")).toBe(scope);
      expect(
        mergePermissions([
          entry({ level: "none" }, "all"),
          entry({ level: "view" }, scope),
        ]).get("school:student:view"),
      ).toBe(scope);
    },
  );
  it("merges separate feature actions without partial or wildcard matches", () => {
    const permissions = mergePermissions([
      entry({ level: "view" }, "personal"),
    ]);
    expect(hasPermission(permissions, "school:student:view")).toBe(true);
    expect(hasPermission(permissions, "school:teacher:view")).toBe(false);
    expect(hasPermission(permissions, "school:student:update")).toBe(false);
    expect(mergePermissions([]).size).toBe(0);
  });
  it("does not mutate inputs or retain prior results", () => {
    const grants = [entry({ level: "manage" }, "all")];
    const snapshot = structuredClone(grants);
    mergePermissions(grants);
    expect(grants).toEqual(snapshot);
    expect(mergePermissions([]).size).toBe(0);
  });
});
