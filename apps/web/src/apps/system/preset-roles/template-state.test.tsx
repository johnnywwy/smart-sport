import {
  appDefinitions,
  presetRoleSchema,
  savePresetRoleSchema,
} from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GrantRow } from "./components/grant-row/GrantRow";
import { MenuGrantRow } from "./components/menu-grant-row/MenuGrantRow";
import { permissionPreviewTree } from "./preview-tree";
import {
  applyMenuGrant,
  changedCount,
  configurationGroups,
  previewActions,
  sameGrant,
  templateValues,
} from "./template-state";

const role = presetRoleSchema.parse({
  id: "01935000-0000-7000-8000-000000000001",
  name: "学校管理员",
  identityType: "school",
  version: 3,
  dataScope: "all",
  defaultDataScope: "all",
  remark: null,
  modified: false,
  editable: true,
  allowedActions: ["update", "reset"],
  grants: appDefinitions.flatMap((app) =>
    Object.entries(app.features).map(([feature, definition]) => ({
      app: app.code,
      appName: app.name,
      feature,
      featureName: definition.name,
      grant: { level: app.code === "school" ? "manage" : "none" },
      defaultGrant: { level: app.code === "school" ? "manage" : "none" },
      modified: false,
    })),
  ),
  usage: { organizationCount: 2, userCount: 3, identityCount: 4 },
});

describe("角色模板草稿和预览", () => {
  it("保存体保留全部功能、无权限档位和版本，不把响应展示字段带入请求", () => {
    const values = templateValues(role);
    expect(savePresetRoleSchema.parse(values)).toEqual(values);
    expect(values.version).toBe(3);
    expect(values.grants).toHaveLength(role.grants.length);
    expect(values.grants.some((entry) => entry.grant.level === "none")).toBe(
      true,
    );
    expect(values.grants[0]).not.toHaveProperty("featureName");
  });
  it("草稿比较不把自定义动作顺序视作权限变化", () => {
    expect(
      sameGrant(
        { level: "custom", actions: ["view", "export"] },
        { level: "custom", actions: ["export", "view"] },
      ),
    ).toBe(true);
    expect(sameGrant({ level: "view" }, { level: "edit" })).toBe(false);
  });
  it("统计未保存的说明、数据范围和功能修改", () => {
    const values = templateValues(role);
    expect(changedCount(role, values)).toBe(0);
    values.dataScope = "personal";
    values.remark = "已调整";
    const student = values.grants.find(
      (entry) => entry.app === "school" && entry.feature === "student",
    );
    if (!student) throw new Error("测试目录缺少学生功能");
    student.grant = { level: "view" };
    expect(changedCount(role, values)).toBe(3);
    expect(role.remark).toBeNull();
  });
  it("编辑档位排除删除、导出和敏感动作；管理也只包含该功能已声明动作", () => {
    expect(previewActions("school", "student", { level: "edit" })).toEqual([
      "view",
      "create",
      "update",
    ]);
    expect(previewActions("school", "profile", { level: "manage" })).toEqual([
      "view",
      "update",
    ]);
    expect(
      previewActions("school", "profile", {
        level: "custom",
        actions: ["sensitive", "view"],
      }),
    ).toEqual(["view"]);
  });
  it("没有查询动作时不预览菜单，学校身份不会看到平台模块", () => {
    const values = templateValues(role);
    let menus = permissionPreviewTree(role, values).flatMap(
      (group) => group.children,
    );
    expect(menus.some((menu) => menu.name === "班级管理")).toBe(true);
    expect(menus.some((menu) => menu.name === "角色模板")).toBe(false);
    values.grants = values.grants.map((entry) => ({
      ...entry,
      grant: { level: "custom", actions: ["update"] },
    }));
    menus = permissionPreviewTree(role, values).flatMap(
      (group) => group.children,
    );
    expect(menus).toEqual([]);
  });
  it("实时预览的动作跟随草稿，院系专业独立于两类班级", () => {
    const values = templateValues(role);
    values.grants = values.grants.map((entry) =>
      entry.app === "school" && entry.feature === "student"
        ? { ...entry, grant: { level: "edit" } }
        : entry,
    );
    const menus = permissionPreviewTree(role, values).flatMap(
      (group) => group.children,
    );
    const student = menus.find((menu) => menu.name === "学生管理");
    expect(student?.children.map((action) => action.name)).toEqual([
      "查询",
      "新增",
      "编辑",
    ]);
    const classes = menus.find((menu) => menu.name === "班级管理");
    expect(classes?.children.map((feature) => feature.name)).toEqual([
      "行政班",
      "教学班",
    ]);
    expect(menus.find((menu) => menu.name === "院系专业")).toBeDefined();
    expect(menus.findIndex((menu) => menu.name === "院系专业")).toBeLessThan(
      menus.findIndex((menu) => menu.name === "班级管理"),
    );
    expect(menus.some((menu) => menu.name === "学校档案")).toBe(false);
    const next = {
      ...values,
      grants: values.grants.map((entry) =>
        entry.app === "school" && entry.feature === "college"
          ? { ...entry, grant: { level: "none" as const } }
          : entry,
      ),
    };
    const nextMenus = permissionPreviewTree(role, next).flatMap(
      (group) => group.children,
    );
    expect(nextMenus.some((menu) => menu.name === "院系专业")).toBe(false);
    expect(nextMenus.find((menu) => menu.name === "班级管理")).toEqual(classes);
  });
  it("自定义权限直接显示在菜单名称旁，只读时禁用勾选且没有档位或细调控件", () => {
    const feature = role.grants.find(
      (entry) => entry.app === "school" && entry.feature === "student",
    );
    if (!feature) throw new Error("缺少学生功能");
    const html = renderToStaticMarkup(
      <GrantRow
        feature={{ ...feature, featureName: "学生管理" }}
        grant={{ level: "custom", actions: ["view", "export"] }}
        disabled
        canReset={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="学生管理按钮权限"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain("template-grant-expand");
    expect(html).toContain("disabled");
    expect(html).not.toContain("细调按钮");
  });
  it("班级菜单只配置两类班级，院系专业单独配置，完整提交不会漏项", () => {
    const groups = configurationGroups(role);
    const classes = groups
      .flatMap((group) => group.items)
      .find((item) => item.name === "班级管理");
    expect(classes?.features.map((feature) => feature.feature)).toEqual([
      "class",
      "teaching-class",
    ]);
    const colleges = groups
      .flatMap((group) => group.items)
      .find((item) => item.name === "院系专业");
    expect(colleges?.features.map((feature) => feature.feature)).toEqual([
      "college",
    ]);
    const keys = groups.flatMap((group) =>
      group.items.flatMap((item) =>
        item.features.map((feature) => `${feature.app}:${feature.feature}`),
      ),
    );
    const applicable = role.grants.filter((feature) =>
      ["org", "school"].includes(feature.app),
    );
    expect(new Set(keys).size).toBe(applicable.length);
    expect(keys).toHaveLength(applicable.length);
    expect(groups.some((group) => group.name === "其他功能")).toBe(false);
    expect(
      savePresetRoleSchema.parse(templateValues(role)).grants,
    ).toHaveLength(role.grants.length);
  });
  it("按钮权限使用可访问复选控件；只读时不提供恢复操作", () => {
    const feature = role.grants.find(
      (entry) => entry.app === "school" && entry.feature === "student",
    );
    if (!feature) throw new Error("缺少学生功能");
    const html = renderToStaticMarkup(
      <GrantRow
        feature={{ ...feature, modified: true }}
        grant={feature.grant}
        disabled
        canReset={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("恢复此项默认");
    expect(html).not.toContain(role.id);
  });
  it("学校管理保持一个菜单名，不能额外生成学校档案菜单", () => {
    const company = { ...role, identityType: "company" as const };
    const school = configurationGroups(company)
      .flatMap((group) => group.items)
      .find((item) => item.key === "schools");
    if (!school) throw new Error("缺少学校管理");
    const values = templateValues(role);
    const html = renderToStaticMarkup(
      <MenuGrantRow
        item={school}
        values={values}
        disabled={false}
        canReset={false}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(html).toContain("学校管理");
    expect(html).not.toContain("学校档案");
    expect(html).not.toContain("学校列表");
  });
  it("编辑班级按钮权限不改动院系专业权限，只提交功能已声明的动作", () => {
    const classes = configurationGroups(role)
      .flatMap((group) => group.items)
      .find((item) => item.key === "classes");
    if (!classes) throw new Error("缺少班级管理");
    const values = templateValues(role);
    const grants = applyMenuGrant(values, classes.features, {
      level: "custom",
      actions: ["view", "import", "sensitive"],
    });
    const college = grants.find(
      (entry) => entry.app === "school" && entry.feature === "college",
    );
    const administrative = grants.find(
      (entry) => entry.app === "school" && entry.feature === "class",
    );
    expect(college?.grant).toEqual({ level: "manage" });
    expect(administrative?.grant).toEqual({
      level: "custom",
      actions: ["view", "import"],
    });
    expect(
      grants.find(
        (entry) => entry.app === "school" && entry.feature === "student",
      )?.grant,
    ).toEqual({ level: "manage" });
    expect(savePresetRoleSchema.safeParse({ ...values, grants }).success).toBe(
      true,
    );
  });
  it("编辑院系专业权限不改动行政班和教学班", () => {
    const colleges = configurationGroups(role)
      .flatMap((group) => group.items)
      .find((item) => item.key === "colleges");
    if (!colleges) throw new Error("缺少院系专业");
    const values = templateValues(role);
    const grants = applyMenuGrant(values, colleges.features, {
      level: "custom",
      actions: ["view", "import"],
    });
    expect(grants.find((entry) => entry.feature === "college")?.grant).toEqual({
      level: "custom",
      actions: ["view"],
    });
    for (const feature of ["class", "teaching-class"]) {
      expect(grants.find((entry) => entry.feature === feature)?.grant).toEqual({
        level: "manage",
      });
    }
    expect(savePresetRoleSchema.safeParse({ ...values, grants }).success).toBe(
      true,
    );
  });
});
