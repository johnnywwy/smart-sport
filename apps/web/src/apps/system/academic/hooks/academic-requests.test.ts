import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../shared/api/client", () => ({
  apiClient: { request },
}));

import { ApiError } from "../../../../shared/errors/api-error";
import {
  academicYearExample,
  currentAcademicExample,
} from "../__tests__/fixtures";
import {
  academicCapabilitiesOptions,
  academicYearsOptions,
  createAcademicYear,
  saveSemester,
  selectCurrentSemester,
} from "./academic-requests";

beforeEach(() => {
  request.mockReset();
});
it("学年与能力查询按身份隔离，并传递查询取消信号", async () => {
  request.mockResolvedValue([]);
  const client = new QueryClient();
  await client.fetchQuery(academicYearsOptions("first"));
  await client.fetchQuery(academicYearsOptions("second"));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0]?.[2]).toMatchObject({ notify: false });
  expect(request.mock.calls[0]?.[2].signal).toBeInstanceOf(AbortSignal);
  request.mockResolvedValue({ allowedActions: [] });
  expect(await client.fetchQuery(academicCapabilitiesOptions("first"))).toEqual(
    { allowedActions: [] },
  );
  expect(academicYearsOptions("first").queryKey).not.toEqual(
    academicYearsOptions("second").queryKey,
  );
  client.clear();
});
it("创建与修改传递精确契约、版本、幂等键和取消信号，失败不吞掉", async () => {
  const context = {
    idempotencyKey: crypto.randomUUID(),
    signal: new AbortController().signal,
  };
  request.mockResolvedValue(academicYearExample);
  await createAcademicYear({ startYear: 2026 }, context);
  expect(request.mock.calls[0]?.[2]).toEqual({
    method: "POST",
    body: { startYear: 2026 },
    ...context,
  });
  const semester = academicYearExample.semesters[0];
  request.mockResolvedValue(semester);
  await saveSemester(
    semester.id,
    { version: 7, startDate: "2026-09-02", endDate: "2027-01-31" },
    context,
  );
  expect(request.mock.calls[1]?.[2]).toMatchObject({
    method: "PATCH",
    body: {
      version: 7,
      startDate: "2026-09-02",
      endDate: "2027-01-31",
    },
    ...context,
  });
  request.mockResolvedValue(currentAcademicExample);
  await selectCurrentSemester(semester.id, 8, context);
  expect(request.mock.calls[2]?.[2]).toEqual({
    method: "POST",
    body: { version: 8 },
    ...context,
  });
  const conflict = new ApiError(409, 90002);
  request.mockRejectedValue(conflict);
  await expect(selectCurrentSemester(semester.id, 8, context)).rejects.toBe(
    conflict,
  );
});
it("不合法日期在发请求前被共享契约拒绝", () => {
  expect(() =>
    saveSemester(
      academicYearExample.semesters[0].id,
      { version: 1, startDate: "2026-10-01", endDate: "2026-09-01" },
      { idempotencyKey: "key", signal: new AbortController().signal },
    ),
  ).toThrow();
  expect(request).not.toHaveBeenCalled();
});
