import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemberSchema,
  memberExamples,
  memberListQuerySchema,
  setMemberStatusSchema,
  updateMemberSchema,
} from "../dist/index.js";

const id = "01934268-b400-7000-8000-000000000001";
test("新建账号与追加身份明确区分，不接受密码、组织归属或账号状态写入", () => {
  assert.equal(
    createMemberSchema.parse(memberExamples.create).account.mode,
    "new",
  );
  assert.equal(
    createMemberSchema.parse(memberExamples.append).account.mode,
    "existing",
  );
  for (const extra of [{ password: "secret" }, { orgId: id }, { status: 0 }])
    assert.equal(
      createMemberSchema.safeParse({ ...memberExamples.create, ...extra })
        .success,
      false,
    );
  assert.equal(
    createMemberSchema.safeParse({
      ...memberExamples.append,
      account: { ...memberExamples.append.account, realName: "不得改原姓名" },
    }).success,
    false,
  );
});
test("手机号、邮箱和角色列表按共享契约校验", () => {
  for (const account of [
    { ...memberExamples.create.account, phone: "invalid" },
    { ...memberExamples.create.account, email: "invalid" },
  ])
    assert.equal(createMemberSchema.safeParse({ account }).success, false);
  assert.equal(
    createMemberSchema.safeParse({
      ...memberExamples.create,
      roleIds: [id, id],
    }).success,
    false,
  );
});
test("修改必须带版本且有字段，状态只允许0与1", () => {
  assert.equal(updateMemberSchema.safeParse({ version: 0 }).success, false);
  assert.equal(
    updateMemberSchema.safeParse({ departmentId: null }).success,
    false,
  );
  assert.equal(
    updateMemberSchema.parse({ version: 0, departmentId: null }).departmentId,
    null,
  );
  assert.equal(
    setMemberStatusSchema.safeParse({ version: 0, status: 2 }).success,
    false,
  );
});
test("分页、部门与启停筛选从URL参数解析，拒绝未知排序和透传权限字段", () => {
  assert.equal(
    memberListQuerySchema.parse({
      page: "2",
      status: "0",
      includeDescendants: "false",
    }).status,
    0,
  );
  assert.equal(memberListQuerySchema.parse({}).pageSize, 20);
  assert.equal(
    memberListQuerySchema.parse({ departmentId: "unassigned" }).departmentId,
    "unassigned",
  );
  for (const query of [
    { sort: "passwordHash:asc" },
    { pageSize: 101 },
    { permissions: [] },
  ])
    assert.equal(memberListQuerySchema.safeParse(query).success, false);
});
