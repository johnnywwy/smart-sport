import { schoolProfileSchema } from "@smart-sport/contracts";
import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../shared/api/client", () => ({ apiClient: { request } }));

import {
  initialFormValues,
  validateForm,
} from "../../../shared/components/schema-form/form-state";
import { ProfileSummary } from "./components/profile-summary/ProfileSummary";
import { schoolProfileOptions } from "./hooks/use-school-profile";
import {
  profileFormSchema,
  profileValues,
  selectedStageYears,
  stageDescription,
} from "./profile-state";

const schoolProfileExample = schoolProfileSchema.parse({
  schoolId: "019c1472-9e57-7000-8000-000000000001",
  schoolName: "示例九年一贯制学校",
  schoolCode: "1234567890",
  stages: [1, 2],
  stageYears: { "1": 6, "2": 3 },
  nature: "公办",
  address: "示例路1号",
  contactName: "联系人",
  contactPhone: "138****5678",
  version: 0,
  allowedActions: ["update"],
});
beforeEach(() => {
  request.mockReset();
});
it("修改其他字段时省略联系电话，替换和主动清空保持不同语义", () => {
  const fields = [
    {
      name: "contactPhone",
      label: "联系电话",
      type: "custom" as const,
      render: () => null,
    },
  ];
  const initial = initialFormValues(
    fields,
    profileValues(schoolProfileExample),
  );
  const unchanged = validateForm(profileFormSchema, initial, fields, 0);
  expect(unchanged.success).toBe(true);
  if (!unchanged.success) throw new Error("初值无效");
  expect(JSON.stringify(unchanged.data)).not.toContain("contactPhone");
  const replace = profileFormSchema.safeParse({
    ...initial,
    contactPhone: "0571-12345678",
  });
  expect(replace.success && replace.data.contactPhone).toBe("0571-12345678");
  const clear = profileFormSchema.safeParse({ ...initial, contactPhone: null });
  expect(clear.success && clear.data.contactPhone).toBeNull();
  expect(
    profileFormSchema.safeParse({ ...initial, contactPhone: "138****5678" })
      .success,
  ).toBe(false);
});
it("学段移除同步移除对应年限，重新选择使用默认值并保留其余已选年限", () => {
  expect(selectedStageYears([1, 4], { "1": 5, "2": 4 })).toEqual({
    "1": 5,
    "4": 4,
  });
  const input = {
    ...profileValues(schoolProfileExample),
    stages: [1, 4],
    stageYears: selectedStageYears([1, 4], { "1": 5 }),
  };
  expect(profileFormSchema.safeParse(input).success).toBe(true);
  expect(profileFormSchema.safeParse({ ...input, stages: [] }).success).toBe(
    false,
  );
  expect(
    profileFormSchema.safeParse({ ...input, stageYears: { "1": 4, "4": 4 } })
      .success,
  ).toBe(false);
});
it("可选文本清空转为null，标识码保留前导零且长度由契约约束", () => {
  const result = profileFormSchema.safeParse({
    ...profileValues(schoolProfileExample),
    schoolCode: "0123456789",
    address: "",
    contactName: "",
  });
  expect(result.success && result.data).toMatchObject({
    schoolCode: "0123456789",
    address: null,
    contactName: null,
  });
  expect(
    profileFormSchema.safeParse({
      ...profileValues(schoolProfileExample),
      schoolCode: "123",
    }).success,
  ).toBe(false);
});
it("详情仅显示脱敏电话及真实学制，不编造服务状态或显示技术标识", () => {
  const markup = renderToStaticMarkup(
    <ProfileSummary profile={schoolProfileExample} />,
  );
  expect(markup).toContain("138****5678");
  expect(markup).toContain("小学，6年制；初中，3年制");
  expect(markup).not.toContain("服务状态暂未开放查询");
  expect(markup).not.toContain(schoolProfileExample.schoolId);
  expect(markup).not.toContain("服务中");
  expect(stageDescription(schoolProfileExample)).toBe(
    "小学，6年制；初中，3年制",
  );
});
it("档案缓存同时隔离身份和学校，查询携带取消信号", async () => {
  const client = new QueryClient();
  request.mockResolvedValue(schoolProfileExample);
  const options = schoolProfileOptions(
    "identity",
    schoolProfileExample.schoolId,
  );
  await client.fetchQuery(options);
  expect(request.mock.calls[0]?.[0]).toBe(
    `/api/v1/schools/${schoolProfileExample.schoolId}/profile`,
  );
  expect(request.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
  expect(
    client.getQueryData(
      schoolProfileOptions("other", schoolProfileExample.schoolId).queryKey,
    ),
  ).toBeUndefined();
  expect(
    client.getQueryData(
      schoolProfileOptions("identity", "other-school").queryKey,
    ),
  ).toBeUndefined();
  client.clear();
});
