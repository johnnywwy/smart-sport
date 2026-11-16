import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../shared/api/client", () => ({ apiClient: { request } }));

import { ApiError } from "../../../shared/errors/api-error";
import { initialSchoolQuery } from "../../../shared/hooks/school-navigation";
import { schoolManagementOptions } from "./hooks/use-school-management";
import { schoolManagementPage } from "./school-management-state";

const row = (id: string) => ({
  id,
  name: `学校${id}`,
  regionName: "测试地区",
  allowedActions: ["view" as const],
});
const page = (
  items: ReturnType<typeof row>[],
  total = items.length,
  current = 1,
) => ({
  items,
  total,
  page: current,
  pageSize: 100,
});
beforeEach(() => {
  request.mockReset();
});
it("学校列表合并去重分页，两个动作的学校范围独立保留", () => {
  const result = schoolManagementPage(
    {
      operations: [row("a"), row("c")],
      profiles: [row("b"), row("c")],
    },
    { page: 2, pageSize: 2 },
  );
  expect(result.total).toBe(3);
  expect(result.items.map((item) => item.id)).toEqual(["c"]);
  expect(result.profileIds.has("a")).toBe(false);
  expect(result.operationIds.has("b")).toBe(false);
});
it("只有档案查看权限也能读取候选，不要求学校运营权限", async () => {
  request.mockImplementation(async (url: string) => {
    if (url.includes("ops%3Aschool")) throw new ApiError(403, 11101);
    return page([row("profile-only")]);
  });
  const client = new QueryClient();
  const result = await client.fetchQuery(
    schoolManagementOptions("actor", true, initialSchoolQuery()),
  );
  expect(result.items.map((item) => item.id)).toEqual(["profile-only"]);
  expect(result.profileIds.has("profile-only")).toBe(true);
  expect(result.operationIds.size).toBe(0);
  client.clear();
});
it("学校候选遍历后续页，不把网络故障当作无权限或空列表", async () => {
  request.mockImplementation(async (url: string) => {
    if (url.includes("ops%3Aschool")) return page([]);
    return url.includes("page=2&")
      ? page([row("later")], 101, 2)
      : page([row("first")], 101);
  });
  const client = new QueryClient();
  const result = await client.fetchQuery(
    schoolManagementOptions("actor", true, initialSchoolQuery()),
  );
  expect(result.total).toBe(2);
  request.mockRejectedValue(new ApiError(503, 90500));
  await expect(
    client.fetchQuery(
      schoolManagementOptions("other", true, initialSchoolQuery()),
    ),
  ).rejects.toMatchObject({ status: 503 });
  request.mockRejectedValue(new ApiError(403, 11101));
  await expect(
    client.fetchQuery(
      schoolManagementOptions("denied", true, initialSchoolQuery()),
    ),
  ).rejects.toMatchObject({ status: 403 });
  client.clear();
});
it("教育局沿用学校运营分页，不请求学校档案候选", async () => {
  request.mockResolvedValue(page([row("bureau")]));
  const client = new QueryClient();
  const result = await client.fetchQuery(
    schoolManagementOptions("bureau", false, initialSchoolQuery()),
  );
  expect(result.profileIds.size).toBe(0);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[0]).toContain("ops%3Aschool");
  client.clear();
});
