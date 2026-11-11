import { beforeEach, expect, it, vi } from "vitest";
import { useSession } from "../stores/session";

const { request, refresh } = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../api/client", () => ({ apiClient: { request, refresh } }));

import { restoreSession } from "./restore-session";

const identity = {
  id: "identity",
  orgId: "org",
  type: "company" as const,
  typeName: "公司",
  orgName: "平台",
  departmentName: null,
  title: null,
  roleIds: [],
  lastUsed: true,
  available: true,
  unavailableReason: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  useSession.getState().clearSession();
});
it("启动并发恢复只轮换一次 Cookie，恢复服务端当前身份", async () => {
  refresh.mockImplementation(async () =>
    useSession
      .getState()
      .refreshToken("restored-token", useSession.getState().generation),
  );
  request.mockResolvedValue({
    mustChangePassword: false,
    identityCount: 1,
    currentIdentity: identity,
  });
  await Promise.all([restoreSession(), restoreSession()]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith(true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(useSession.getState().currentIdentity).toEqual(identity);
  expect(useSession.getState().accessToken).toBe("restored-token");
});
it("账号级会话恢复改密状态，不自行选择上次身份", async () => {
  refresh.mockImplementation(async () =>
    useSession
      .getState()
      .refreshToken("account-token", useSession.getState().generation),
  );
  request.mockResolvedValue({
    mustChangePassword: true,
    identityCount: 2,
    currentIdentity: null,
  });
  await restoreSession();
  expect(useSession.getState().currentIdentity).toBeNull();
  expect(useSession.getState().mustChangePassword).toBe(true);
});
it("过期 Cookie 恢复失败，不伪造登录身份", async () => {
  refresh.mockRejectedValue(new Error("expired"));
  await expect(restoreSession()).rejects.toThrow("expired");
  expect(request).not.toHaveBeenCalled();
  expect(useSession.getState().currentIdentity).toBeNull();
});
