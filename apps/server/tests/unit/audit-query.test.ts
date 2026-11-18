import "reflect-metadata";
import { auditLogQuerySchema } from "@smart-sport/contracts";
import { expect, it, vi } from "vitest";
import type { AuditQueryRepository } from "../../src/modules/platform/audit/index.js";
import { AuditQueryService } from "../../src/modules/platform/audit/index.js";
import type {
  IdentityContext,
  IdentityContextService,
} from "../../src/modules/platform/identity-context/index.js";

const actor: IdentityContext = {
  userId: "user",
  identityId: "identity",
  orgId: "server-org",
  identityType: "company",
  orgType: "company",
  tokenVersion: 0,
  departmentId: null,
  roleIds: [],
  client: "admin",
  permissions: new Map([["org:audit:view", "all"]]),
};
function fixture(fresh = actor, current = true) {
  const repository = {
    list: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  };
  const contexts = {
    loadSnapshot: vi.fn().mockResolvedValue({ context: fresh, revision: "1" }),
    isCurrent: vi.fn().mockResolvedValue(current),
  };
  return {
    repository,
    contexts,
    service: new AuditQueryService(
      repository as unknown as AuditQueryRepository,
      contexts as unknown as IdentityContextService,
    ),
  };
}
it("本组织范围由新上下文确定，不接受调用者携带的旧组织和权限", async () => {
  const f = fixture({ ...actor, orgId: "fresh-org" });
  await f.service.list(auditLogQuerySchema.parse({}), actor);
  expect(f.repository.list).toHaveBeenCalledWith(
    expect.anything(),
    "fresh-org",
  );
  const denied = fixture({ ...actor, permissions: new Map() });
  await expect(
    denied.service.list(auditLogQuerySchema.parse({}), actor),
  ).rejects.toMatchObject({ code: 11101 });
  expect(denied.repository.list).not.toHaveBeenCalled();
});
it("系统权限不能使非公司身份读取全平台，也不能替代本组织权限", async () => {
  for (const identityType of ["school", "agent", "bureau"] as const) {
    const f = fixture({
      ...actor,
      identityType,
      permissions: new Map([["system:audit:view", "all"]]),
    });
    await expect(
      f.service.list(auditLogQuerySchema.parse({ scope: "platform" }), actor),
    ).rejects.toMatchObject({ code: 11101 });
    expect(f.repository.list).not.toHaveBeenCalled();
  }
  const f = fixture({
    ...actor,
    permissions: new Map([["system:audit:view", "all"]]),
  });
  await expect(
    f.service.list(auditLogQuerySchema.parse({}), actor),
  ).rejects.toMatchObject({ code: 11101 });
});
it("读取时持续变权超过重试限额返回503，账号或令牌版本不一致拒绝", async () => {
  const f = fixture(actor, false);
  await expect(
    f.service.list(auditLogQuerySchema.parse({}), actor),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.repository.list).toHaveBeenCalledTimes(3);
  for (const fresh of [
    { ...actor, tokenVersion: 1 },
    { ...actor, userId: "other" },
  ]) {
    const denied = fixture(fresh);
    await expect(
      denied.service.list(auditLogQuerySchema.parse({}), actor),
    ).rejects.toMatchObject({ code: 10005 });
    expect(denied.repository.list).not.toHaveBeenCalled();
  }
});
