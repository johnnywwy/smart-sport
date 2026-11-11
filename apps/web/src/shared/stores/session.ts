import { create } from "zustand";

type SessionState = {
  accessToken: string | null;
  generation: number;
  startSession: (accessToken: string) => void;
  refreshToken: (accessToken: string, generation: number) => void;
  clearSession: () => void;
};

// 不使用 persist；每次登录、选择身份或退出都使在途请求失效。
export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  generation: 0,
  startSession: (accessToken) =>
    set((state) => ({ accessToken, generation: state.generation + 1 })),
  refreshToken: (accessToken, generation) =>
    set((state) => (state.generation === generation ? { accessToken } : state)),
  clearSession: () =>
    set((state) => ({ accessToken: null, generation: state.generation + 1 })),
}));
