import type { scopeSchoolSchema } from "@smart-sport/contracts";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../api/client", () => ({ apiClient: { request } }));

import { ApiError } from "../errors/api-error";
import { schoolMenuPermissions } from "./school-navigation";
import {
  findMenuSchool,
  menuSchoolOptions,
  requestMenuSchools,
} from "./use-menu-schools";
import { findVisibleSchool, schoolsOptions } from "./use-schools";

const school = (id: string): ReturnType<typeof scopeSchoolSchema.parse> => ({
  id,
  name: "同名学校",
  regionName: "测试地区",
  allowedActions: ["view" as const],
});
const page = (
  items: ReturnType<typeof school>[],
  total = items.length,
  current = 1,
) => ({ items, total, page: current, pageSize: 100 });
const signal = () => new AbortController().signal;
beforeEach(() => {
  request.mockReset();
});
it("按真实菜单引用所有功能权限；组织菜单没有当前学校", () => {
  expect(schoolMenuPermissions("classes")).toEqual([
    "school:class:view",
    "school:teaching-class:view",
  ]);
  expect(schoolMenuPermissions("colleges")).toEqual(["school:college:view"]);
  expect(schoolMenuPermissions("departments")).toEqual([]);
  expect(schoolMenuPermissions("schools")).toEqual([]);
});
it("查询以身份、搜索和动作隔离，传递取消信号和共享契约", async () => {
  const client = new QueryClient();
  request.mockResolvedValue(page([]));
  const query = {
    page: 2,
    pageSize: 20,
    keyword: "学校 +",
    permission: "school:student:view" as const,
  };
  await client.fetchQuery(schoolsOptions("identity", query));
  expect(request.mock.calls[0]?.[0]).toContain(
    "keyword=%E5%AD%A6%E6%A0%A1+%2B",
  );
  expect(request.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
  expect(
    client.getQueryData(schoolsOptions("other", query).queryKey),
  ).toBeUndefined();
  expect(
    menuSchoolOptions("identity", school("id"), ["school:student:view"])
      .queryKey,
  ).not.toEqual(
    menuSchoolOptions("identity", school("id"), ["school:class:view"]).queryKey,
  );
  client.clear();
});
it("历史学校必须以当前动作重查，并遍历同名结果后续页", async () => {
  request
    .mockResolvedValueOnce(page([school("other")], 101))
    .mockResolvedValueOnce(page([school("target")], 101, 2));
  expect(
    (await findVisibleSchool(school("target"), "school:class:view", signal()))
      ?.id,
  ).toBe("target");
  expect(request.mock.calls[1]?.[0]).toContain("page=2");
  request.mockResolvedValueOnce(
    page([{ ...school("target"), allowedActions: [] }]),
  );
  expect(
    await findVisibleSchool(school("target"), "school:student:view", signal()),
  ).toBeNull();
});
it("只有教学班权限也可进入；不能用学校查看权限替代班级权限", async () => {
  request
    .mockRejectedValueOnce(new ApiError(403, 11101))
    .mockResolvedValueOnce(page([school("target")]));
  expect(
    (
      await findMenuSchool(
        school("target"),
        schoolMenuPermissions("classes"),
        signal(),
      )
    )?.id,
  ).toBe("target");
  expect(
    request.mock.calls.every((call) => !call[0].includes("ops%3Aschool")),
  ).toBe(true);
  request.mockRejectedValue(new ApiError(403, 11101));
  await expect(
    findMenuSchool(
      school("target"),
      schoolMenuPermissions("classes"),
      signal(),
    ),
  ).rejects.toMatchObject({ status: 403, code: 11101 });
});
it("班级候选合并两种权限的独立范围、去重分页，不合并写权限", async () => {
  request
    .mockResolvedValueOnce(
      page([
        school("019a0000-0000-7000-8000-000000000001"),
        {
          ...school("019a0000-0000-7000-8000-000000000002"),
          allowedActions: ["view", "update"],
        },
      ]),
    )
    .mockResolvedValueOnce(
      page([
        school("019a0000-0000-7000-8000-000000000002"),
        school("019a0000-0000-7000-8000-000000000003"),
      ]),
    );
  const result = await requestMenuSchools(
    { page: 2, pageSize: 2 },
    schoolMenuPermissions("classes"),
    signal(),
  );
  expect(result.total).toBe(3);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.allowedActions).toEqual(["view"]);
});
it("查询失败必须阻止进入；超时或服务错误不可降级成空学校", async () => {
  request.mockRejectedValue(new ApiError(503, 90500));
  await expect(
    findMenuSchool(
      school("target"),
      schoolMenuPermissions("classes"),
      signal(),
    ),
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    requestMenuSchools(
      { page: 1, pageSize: 20 },
      schoolMenuPermissions("classes"),
      signal(),
    ),
  ).rejects.toMatchObject({ status: 503 });
});
