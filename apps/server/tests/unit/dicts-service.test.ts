import "reflect-metadata";
import { beforeEach, expect, it, vi } from "vitest";
import type { DictItemRow } from "../../src/modules/platform/dicts/dicts.repository.js";
import {
  DictsRepository,
  DictsService,
  type DictTransaction,
} from "../../src/modules/platform/dicts/index.js";
import type { IdentityContextService } from "../../src/modules/platform/identity-context/index.js";

const row: DictItemRow = {
  id: "019a87ce-7000-7000-8000-000000000001",
  typeCode: "document_type",
  value: "passport",
  label: "护照",
  description: "",
  sort: 1,
  isSystem: true,
  enabled: true,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
  deletedAt: null,
  usedAt: null,
};
const repository = Object.create(DictsRepository.prototype) as DictsRepository;
const byValue = vi.spyOn(repository, "byValue");
const markUsed = vi.spyOn(repository, "markUsed");
const service = new DictsService(repository, {} as IdentityContextService);
const tx = {} as DictTransaction;
beforeEach(() => {
  byValue.mockResolvedValue({ ...row });
  markUsed.mockResolvedValue(undefined as never);
});
it("首次业务使用持有行锁并登记使用，后续使用保留首次时间", async () => {
  markUsed.mockClear();
  expect(await service.use("document_type", "passport", tx)).toEqual({
    value: "passport",
    label: "护照",
  });
  expect(byValue).toHaveBeenLastCalledWith(
    tx,
    "document_type",
    "passport",
    true,
  );
  expect(markUsed).toHaveBeenCalledTimes(1);
  byValue.mockResolvedValue({
    ...row,
    usedAt: new Date("2026-11-01T00:00:00Z"),
  });
  await service.use("document_type", "passport", tx);
  expect(markUsed).toHaveBeenCalledTimes(1);
});
it("停用选项禁止新业务但可解析历史名称，解析不修改使用记录", async () => {
  markUsed.mockClear();
  byValue.mockResolvedValue({ ...row, enabled: false });
  await expect(
    service.use("document_type", "passport", tx),
  ).rejects.toMatchObject({ code: 30014 });
  expect(await service.resolve("document_type", "passport", tx)).toEqual({
    value: "passport",
    label: "护照",
  });
  expect(markUsed).not.toHaveBeenCalled();
});
it("不存在或已删除选项不允许使用或历史解析", async () => {
  byValue.mockResolvedValue(undefined);
  await expect(
    service.use("document_type", "passport", tx),
  ).rejects.toMatchObject({ code: 90004 });
  await expect(
    service.resolve("document_type", "passport", tx),
  ).rejects.toMatchObject({ code: 90004 });
});
