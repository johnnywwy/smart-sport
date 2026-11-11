import { beforeEach, describe, expect, it } from "vitest";
import { useSession } from "./session";

const identity = {
  id: "019a0000-0000-7000-8000-000000000001",
  type: "company" as const,
  typeName: "公司",
  orgId: "019a0000-0000-7000-8000-000000000002",
  orgName: "智慧体育云平台",
  departmentName: null,
  title: "平台超级管理员",
  roleIds: [],
  lastUsed: true,
  available: true,
  unavailableReason: null,
};

beforeEach(() => useSession.getState().clearSession());

describe("内存会话", () => {
  it("开始新会话及选择身份使旧请求失效，刷新不改变身份边界", () => {
    const initialGeneration = useSession.getState().generation;
    useSession.getState().startSession("account-token");
    expect(useSession.getState().generation).toBe(initialGeneration + 1);
    useSession.getState().selectIdentity("identity-token", identity);
    const generation = useSession.getState().generation;
    useSession.getState().refreshToken("renewed-token", generation);
    expect(useSession.getState()).toMatchObject({
      accessToken: "renewed-token",
      generation,
      currentIdentity: identity,
    });
    useSession.getState().clearSession();
    expect(useSession.getState()).toMatchObject({
      accessToken: null,
      generation: generation + 1,
      currentIdentity: null,
    });
    useSession.getState().refreshToken("stale-token", generation);
    expect(useSession.getState().accessToken).toBeNull();
  });
});
