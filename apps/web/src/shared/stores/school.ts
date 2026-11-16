import { create } from "zustand";
import type { SchoolChoice } from "../types/school";
import { useSession } from "./session";

type SchoolState = {
  current: SchoolChoice | null;
  recent: SchoolChoice[];
  select: (school: SchoolChoice) => void;
  discard: (id: string) => void;
  clear: () => void;
};
/** 学校仅是内存页面状态；接口仍需显式传学校 id 并由服务端鉴权。 */
export const useSchool = create<SchoolState>((set) => ({
  current: null,
  recent: [],
  select: (school) =>
    set((state) => ({
      current: school,
      recent: [
        school,
        ...state.recent.filter((item) => item.id !== school.id),
      ].slice(0, 5),
    })),
  discard: (id) =>
    set((state) => ({
      current: state.current?.id === id ? null : state.current,
      recent: state.recent.filter((item) => item.id !== id),
    })),
  clear: () => set({ current: null, recent: [] }),
}));
useSession.subscribe((state, previous) => {
  if (state.generation !== previous.generation) useSchool.getState().clear();
});
