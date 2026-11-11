import type { IdentitySummary } from "@smart-sport/contracts";
import { create } from "zustand";

type SessionState = {
  accessToken: string | null;
  generation: number;
  mustChangePassword: boolean | null;
  identityCount: number | null;
  currentIdentity: IdentitySummary | null;
  setLoginContext: (mustChangePassword: boolean, identityCount: number) => void;
  startSession: (accessToken: string) => void;
  selectIdentity: (
    accessToken: string,
    currentIdentity: IdentitySummary,
  ) => void;
  refreshToken: (accessToken: string, generation: number) => void;
  clearSession: () => void;
};

// 不使用 persist；每次登录、选择身份或退出都使在途请求失效。
export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  generation: 0,
  mustChangePassword: null,
  identityCount: null,
  currentIdentity: null,
  setLoginContext: (mustChangePassword, identityCount) =>
    set({ mustChangePassword, identityCount }),
  startSession: (accessToken) =>
    set((state) => ({
      accessToken,
      generation: state.generation + 1,
      mustChangePassword: null,
      identityCount: null,
      currentIdentity: null,
    })),
  selectIdentity: (accessToken, currentIdentity) =>
    set((state) => ({
      accessToken,
      currentIdentity,
      generation: state.generation + 1,
      mustChangePassword: false,
    })),
  refreshToken: (accessToken, generation) =>
    set((state) => (state.generation === generation ? { accessToken } : state)),
  clearSession: () =>
    set((state) => ({
      accessToken: null,
      generation: state.generation + 1,
      mustChangePassword: null,
      identityCount: null,
      currentIdentity: null,
    })),
}));
