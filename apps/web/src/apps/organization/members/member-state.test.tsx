import {
  type AssignableMemberRole,
  appDefinitions,
  type Member,
} from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import {
  combinedRolePreview,
  createMemberBody,
  editMemberFormSchema,
  initialMemberQuery,
  memberQuery,
  newMemberFormSchema,
  runMemberBatch,
} from "./member-state";

const id = "019b0000-0000-7000-8000-000000000001";
const draft = {
  mode: "new" as const,
  username: "tester",
  realName: "测试成员",
  phone: "",
  email: "",
  account: "",
  departmentId: null,
  title: "",
  roleIds: [],
};
describe("成员表单与列表", () => {
  it("新建校验与提交都使用契约，空选填项不冒充有效值", () => {
    const result = newMemberFormSchema.safeParse(draft);
    expect(result.success).toBe(true);
    expect(createMemberBody(draft)).toEqual({
      account: { mode: "new", username: "tester", realName: "测试成员" },
      departmentId: null,
      title: null,
      roleIds: [],
    });
  });
  it("追加已有账号不发送新账号姓名或凭据", () => {
    expect(
      createMemberBody({ ...draft, mode: "existing", account: "existing-user" })
        .account,
    ).toEqual({ mode: "existing", account: "existing-user" });
  });
  it("共享契约的嵌套字段错误映射回可编辑字段", () => {
    const result = newMemberFormSchema.safeParse({ ...draft, phone: "123" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) => issue.path.join(".") === "phone"),
      ).toBe(true);
  });
  it("未分配部门、下级开关和服务端分页不会丢失", () => {
    expect(
      memberQuery(
        {
          ...initialMemberQuery,
          page: 2,
          filters: { descendants: "true", status: "0" },
        },
        "unassigned",
      ),
    ).toMatchObject({
      page: 2,
      departmentId: "unassigned",
      includeDescendants: true,
      status: 0,
    });
  });
  it("编辑允许清空选填职务，保留原始版本", () => {
    expect(
      editMemberFormSchema.safeParse({
        version: 3,
        title: "",
        departmentId: null,
      }),
    ).toEqual({
      success: true,
      data: { version: 3, title: null, departmentId: null },
    });
  });
});
describe("成员批量提交", () => {
  const rows = [
    { id, realName: "甲", version: 2 },
    { id: "019b0000-0000-7000-8000-000000000002", realName: "乙", version: 5 },
  ] as Member[];
  it("部分失败保留原版本与姓名，成功项不会进入重试集合", async () => {
    const called: string[] = [];
    const result = await runMemberBatch(rows, async (row) => {
      called.push(row.id);
      if (row.realName === "乙")
        throw Object.assign(new Error("版本冲突"), { code: 90002 });
    });
    expect(called).toEqual(rows.map((row) => row.id));
    expect(result.succeeded).toEqual([id]);
    expect(result.failures).toEqual([
      { row: rows[1], message: "版本冲突", conflict: true },
    ]);
  });
  it("取消后不再提交剩余记录", async () => {
    let cancelled = false;
    const result = await runMemberBatch(
      rows,
      async () => {
        cancelled = true;
      },
      () => cancelled,
    );
    expect(result.succeeded).toEqual([id]);
    expect(result.failures).toEqual([]);
  });
});
describe("多角色菜单预览", () => {
  it("菜单来自声明，只显示有查询动作的菜单", () => {
    const roles: AssignableMemberRole[] = [
      {
        id,
        name: "成员查看",
        kind: "custom",
        identityType: "company",
        dataScope: "dept",
        remark: null,
        grants: [{ app: "org", feature: "member", grant: { level: "view" } }],
      },
    ];
    const text = JSON.stringify(combinedRolePreview(roles, "company"));
    expect(text).toContain("成员账号");
    expect(text).not.toContain("学校档案");
    expect(text).not.toContain("新增");
  });
  it("合并不同角色的动作但不创造权限", () => {
    const base = {
      id,
      name: "角色",
      kind: "custom" as const,
      identityType: "company" as const,
      dataScope: "personal" as const,
      remark: null,
    };
    const nodes = combinedRolePreview(
      [
        {
          ...base,
          grants: [{ app: "org", feature: "member", grant: { level: "view" } }],
        },
        {
          ...base,
          grants: [
            {
              app: "org",
              feature: "member",
              grant: { level: "custom", actions: ["update"] },
            },
          ],
        },
      ],
      "company",
    );
    expect(JSON.stringify(nodes)).toContain("编辑");
    expect(JSON.stringify(nodes)).not.toContain("删除");
    expect(appDefinitions.length).toBeGreaterThan(0);
  });
});

it("逐动作计算范围，查看的宽范围不会扩大编辑范围", () => {
  const base = {
    id,
    name: "测试角色",
    kind: "custom" as const,
    identityType: "company" as const,
    remark: null,
  };
  const preview = JSON.stringify(
    combinedRolePreview(
      [
        {
          ...base,
          dataScope: "all",
          grants: [{ app: "org", feature: "member", grant: { level: "view" } }],
        },
        {
          ...base,
          dataScope: "personal",
          grants: [
            {
              app: "org",
              feature: "member",
              grant: { level: "custom", actions: ["update"] },
            },
          ],
        },
      ],
      "company",
    ),
  );
  expect(preview).toContain("查询 · 本机构全部");
  expect(preview).toContain("编辑 · 只看自己负责的");
  expect(preview).not.toContain("编辑 · 本机构全部");
});
