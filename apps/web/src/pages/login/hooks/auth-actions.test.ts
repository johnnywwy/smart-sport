import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../../../shared/stores/session";

const { request, refresh } = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../../../shared/api/client", () => ({
  apiClient: { request, refresh },
}));

import {
  changeAccountPassword,
  loginAccount,
} from "../../../shared/hooks/auth-actions";

beforeEach(() => {
  vi.resetAllMocks();
  useSession.getState().clearSession();
});
describe("登录与改密流程", () => {
  it.each([true, false])(
    "登录按强制改密状态 %s 分流，内存保留登录上下文",
    async (mustChangePassword) => {
      request.mockResolvedValue({
        accessToken: "account-token",
        mustChangePassword,
        identityCount: 2,
        selectedIdentity: null,
      });
      expect(
        await loginAccount({ account: " demo ", password: "123456" }),
      ).toBe(mustChangePassword ? "/change-password" : "/select-org");
      expect(useSession.getState()).toMatchObject({
        accessToken: "account-token",
        mustChangePassword,
        identityCount: 2,
      });
      expect(request.mock.calls[0]?.[2]).toMatchObject({
        auth: false,
        body: { account: "demo" },
      });
    },
  );
  it("单身份自动选择后直接进入门户", async () => {
    request.mockResolvedValue({
      accessToken: "identity-token",
      mustChangePassword: false,
      identityCount: 1,
      selectedIdentity: {
        id: "019a0000-0000-7000-8000-000000000001",
        type: "company",
        typeName: "公司",
        orgId: "019a0000-0000-7000-8000-000000000002",
        orgName: "平台公司",
        departmentName: null,
        title: null,
        roleIds: [],
        lastUsed: true,
        available: true,
        unavailableReason: null,
      },
    });
    expect(await loginAccount({ account: "admin", password: "123456" })).toBe(
      "/portal",
    );
    expect(useSession.getState().accessToken).toBe("identity-token");
  });

  it("改密成功后刷新令牌再解除强制改密状态", async () => {
    useSession.getState().startSession("old-token");
    useSession.getState().setLoginContext(true, 1);
    request.mockResolvedValue(null);
    refresh.mockImplementation(async () => {
      expect(useSession.getState().mustChangePassword).toBe(true);
      useSession
        .getState()
        .refreshToken("new-token", useSession.getState().generation);
    });
    await changeAccountPassword({
      oldPassword: "123456",
      newPassword: "newPassword1",
    });
    expect(useSession.getState()).toMatchObject({
      accessToken: "new-token",
      mustChangePassword: false,
      identityCount: 1,
    });
  });
  it("改密失败不刷新、不解除强制改密", async () => {
    useSession.getState().setLoginContext(true, 1);
    request.mockRejectedValue(new Error("旧密码错误"));
    await expect(
      changeAccountPassword({
        oldPassword: "wrong",
        newPassword: "newPassword1",
      }),
    ).rejects.toThrow("旧密码错误");
    expect(refresh).not.toHaveBeenCalled();
    expect(useSession.getState().mustChangePassword).toBe(true);
  });
  it("刷新失败不解除强制改密", async () => {
    useSession.getState().setLoginContext(true, 1);
    request.mockResolvedValue(null);
    refresh.mockRejectedValue(new Error("会话过期"));
    await expect(
      changeAccountPassword({
        oldPassword: "123456",
        newPassword: "newPassword1",
      }),
    ).rejects.toThrow("会话过期");
    expect(useSession.getState().mustChangePassword).toBe(true);
  });
  it("晚到的登录结果不能覆盖新会话", async () => {
    request.mockImplementation(async () => {
      useSession.getState().startSession("another-session");
      return {
        accessToken: "late-token",
        mustChangePassword: false,
        identityCount: 1,
        selectedIdentity: null,
      };
    });
    await expect(
      loginAccount({ account: "demo", password: "123456" }),
    ).rejects.toThrow("会话已变更");
    expect(useSession.getState().accessToken).toBe("another-session");
  });
});
