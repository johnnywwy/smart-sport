import {
  appDefinitions,
  type RoleDetail,
  roleDetailSchema,
  saveRoleGrantsSchema,
} from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionPermissions } from "../../../shared/components/role-permissions/action-permissions/ActionPermissions";
import { configurationGroups } from "../../../shared/components/role-permissions/permission-state";
import { RoleList } from "./components/role-list/RoleList";
import {
  actorScopes,
  boundedRoleSchema,
  canGrant,
  createRoleFormSchema,
  grantsFit,
  permissionRole,
  roleChanges,
  roleValues,
} from "./role-state";

function fixture(changes: Partial<RoleDetail> = {}): RoleDetail {
  return roleDetailSchema.parse({
    id: "01935000-0000-7000-8000-000000000001",
    name: "测试角色",
    kind: "preset",
    identityType: "company",
    baseRoleId: null,
    baseRoleName: null,
    dataScope: "personal",
    remark: null,
    version: 0,
    modified: false,
    allowedActions: [],
    grants: appDefinitions.flatMap((app) =>
      Object.entries(app.features).map(([feature, def]) => ({
        app: app.code,
        feature,
        appName: app.name,
        featureName: def.name,
        grant: { level: "none" },
        baseGrant: { level: "none" },
        modified: false,
      })),
    ),
    ...changes,
  });
}
function withDepartment(role: RoleDetail, level: "view" | "edit") {
  return {
    ...role,
    grants: role.grants.map((entry) =>
      entry.app === "org" && entry.feature === "department"
        ? { ...entry, grant: { level } }
        : entry,
    ),
  };
}
describe("本组织角色权限边界与契约", () => {
  it("保存使用完整共享契约，只提交授权、范围和版本，不含展示字段", () => {
    const role = fixture();
    const values = roleValues(role);
    expect(saveRoleGrantsSchema.parse(values)).toEqual(values);
    expect(values.version).toBe(0);
    expect(values.grants.length).toBe(role.grants.length);
    expect(values.grants[0]).not.toHaveProperty("baseGrant");
  });
  it("新建数据范围始终取当前选中的内置基础角色", () => {
    const narrow = fixture();
    const wide = fixture({
      id: "01935000-0000-7000-8000-000000000002",
      dataScope: "all",
    });
    const schema = createRoleFormSchema([narrow, wide]);
    expect(
      schema.safeParse({ name: "  新角色  ", baseRoleId: narrow.id }),
    ).toMatchObject({
      success: true,
      data: { name: "新角色", dataScope: "personal" },
    });
    expect(
      schema.safeParse({ name: "新角色", baseRoleId: wide.id }),
    ).toMatchObject({ success: true, data: { dataScope: "all" } });
    expect(
      schema.safeParse({
        name: "新角色",
        baseRoleId: wide.id,
        dataScope: "personal",
      }),
    ).toMatchObject({ success: true, data: { dataScope: "all" } });
  });
  it("新建拒绝未知或自定义基础角色，名称校验沿用契约", () => {
    const role = fixture({ kind: "custom" });
    expect(
      createRoleFormSchema([role]).safeParse({
        name: "新角色",
        baseRoleId: role.id,
      }).success,
    ).toBe(false);
    expect(
      createRoleFormSchema([]).safeParse({
        name: "新角色",
        baseRoleId: role.id,
      }).success,
    ).toBe(false);
    expect(
      createRoleFormSchema([fixture()]).safeParse({
        name: " ",
        baseRoleId: role.id,
      }).success,
    ).toBe(false);
  });
  it("查询的全机构范围不能放大编辑动作的个人范围", () => {
    const readAll = withDepartment(fixture({ dataScope: "all" }), "view");
    const editOwn = withDepartment(fixture(), "edit");
    const scopes = actorScopes([readAll, editOwn]);
    expect(canGrant(scopes, "all", "org", "department", "view")).toBe(true);
    expect(canGrant(scopes, "personal", "org", "department", "update")).toBe(
      true,
    );
    expect(canGrant(scopes, "all", "org", "department", "update")).toBe(false);
    expect(
      grantsFit(scopes, roleValues({ ...editOwn, dataScope: "all" })),
    ).toBe(false);
    expect(
      boundedRoleSchema(scopes).safeParse(
        roleValues({ ...editOwn, dataScope: "all" }),
      ).success,
    ).toBe(false);
    expect(
      boundedRoleSchema(scopes).safeParse(roleValues(editOwn)).success,
    ).toBe(true);
  });
  it("没有权限或空授权也不能提交超出自身最宽范围的数据范围", () => {
    expect(grantsFit(actorScopes([]), roleValues(fixture()))).toBe(false);
    const scopes = actorScopes([withDepartment(fixture(), "view")]);
    expect(grantsFit(scopes, roleValues(fixture({ dataScope: "all" })))).toBe(
      false,
    );
    expect(grantsFit(scopes, roleValues(fixture()))).toBe(true);
  });
  it("草稿和基础值分别比较，恢复所依赖的基础值不会覆盖当前值", () => {
    const role = withDepartment(fixture(), "edit");
    const display = permissionRole(role);
    const feature = display.grants.find(
      (entry) => entry.feature === "department" && entry.app === "org",
    );
    expect(feature?.grant.level).toBe("edit");
    expect(feature?.defaultGrant.level).toBe("none");
    expect(roleChanges(role, roleValues(role))).toBe(0);
    expect(roleChanges(role, { ...roleValues(role), dataScope: "all" })).toBe(
      1,
    );
  });
  it("菜单来自共享导航声明，院系专业独立，班级只包含行政班及教学班", () => {
    const menus = configurationGroups(
      permissionRole(fixture({ identityType: "school" })),
    ).flatMap((group) => group.items);
    expect(
      menus
        .find((menu) => menu.key === "classes")
        ?.features.map((entry) => entry.feature),
    ).toEqual(["class", "teaching-class"]);
    expect(
      menus
        .find((menu) => menu.key === "colleges")
        ?.features.map((entry) => entry.feature),
    ).toEqual(["college"]);
    expect(menus.filter((menu) => menu.name === "学校档案")).toHaveLength(0);
  });
  it("新建按钮依据真实权限显示，不能从角色名称推断", () => {
    const props = {
      roles: [fixture()],
      selected: undefined,
      disabled: false,
      onSelect: () => {},
      onCreate: () => {},
    };
    expect(
      renderToStaticMarkup(<RoleList {...props} permissions={[]} />),
    ).not.toContain("新建角色");
    expect(
      renderToStaticMarkup(
        <RoleList {...props} permissions={["org:role:create"]} />,
      ),
    ).toContain("新建角色");
  });
  it("未拥有的动作禁用，已勾选的动作仍可撤回", () => {
    const markup = renderToStaticMarkup(
      <ActionPermissions
        name="测试按钮"
        actions={["view", "update", "delete"]}
        selected={["update"]}
        disabled={false}
        grantableActions={["view"]}
        onChange={() => {}}
      />,
    );
    expect(markup.match(/ disabled=""/g)).toHaveLength(1);
    expect(markup).toContain('value="delete"');
  });
});
