import { create } from "zustand";
import type { AcademicPeriod } from "../types/academic";
import { useSession } from "./session";

type AcademicState = {
  identityId: string | null;
  /** null 表示跟随平台当前学期；手选历史或未来学期只改变页面上下文。 */
  choice: AcademicPeriod | null;
  select: (identityId: string, choice: AcademicPeriod | null) => void;
  discard: (identityId: string, semesterId: string) => void;
  clear: () => void;
};
export const useAcademic = create<AcademicState>((set) => ({
  identityId: null,
  choice: null,
  select: (identityId, choice) => set({ identityId, choice }),
  discard: (identityId, semesterId) =>
    set((state) =>
      state.identityId === identityId && state.choice?.semesterId === semesterId
        ? { choice: null }
        : state,
    ),
  clear: () => set({ identityId: null, choice: null }),
}));
useSession.subscribe((state, previous) => {
  if (state.generation !== previous.generation) useAcademic.getState().clear();
});
