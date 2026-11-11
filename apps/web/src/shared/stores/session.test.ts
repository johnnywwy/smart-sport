import { beforeEach, describe, expect, it } from "vitest";
import { useSession } from "./session";

beforeEach(() => useSession.getState().clearSession());

describe("内存会话", () => {
  it("开始新会话及选择身份使旧请求失效，刷新不改变身份边界", () => {
    const initialGeneration = useSession.getState().generation;
    useSession.getState().startSession("account-token");
    expect(useSession.getState().generation).toBe(initialGeneration + 1);
    useSession.getState().startSession("identity-token");
    const generation = useSession.getState().generation;
    useSession.getState().refreshToken("renewed-token", generation);
    expect(useSession.getState()).toMatchObject({
      accessToken: "renewed-token",
      generation,
    });
    useSession.getState().clearSession();
    expect(useSession.getState()).toMatchObject({
      accessToken: null,
      generation: generation + 1,
    });
    useSession.getState().refreshToken("stale-token", generation);
    expect(useSession.getState().accessToken).toBeNull();
  });
});
