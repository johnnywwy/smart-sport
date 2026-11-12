import { create } from "zustand";
import { useSession } from "./session";
export type WorkspaceTab = { path: string; name: string };
export function pathAfterClosingTab(
  tabs: WorkspaceTab[],
  closed: string,
  current: string,
  home: string,
): string {
  if (closed !== current) return current;
  return tabs.filter((tab) => tab.path !== closed).at(-1)?.path ?? home;
}
type WorkspaceTabsState = {
  tabs: Record<string, WorkspaceTab[]>;
  recent: Record<string, WorkspaceTab[]>;
  open: (scope: string, tab: WorkspaceTab) => void;
  close: (scope: string, path: string) => void;
  closeOthers: (scope: string, path: string) => void;
  clear: () => void;
};
export const useWorkspaceTabs = create<WorkspaceTabsState>((set) => ({
  tabs: {},
  recent: {},
  open: (scope, tab) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [scope]: state.tabs[scope]?.some((item) => item.path === tab.path)
          ? state.tabs[scope]
          : [...(state.tabs[scope] ?? []), tab],
      },
      recent: {
        ...state.recent,
        [scope]: [
          tab,
          ...(state.recent[scope] ?? []).filter(
            (item) => item.path !== tab.path,
          ),
        ].slice(0, 5),
      },
    })),
  close: (scope, path) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [scope]: (state.tabs[scope] ?? []).filter((item) => item.path !== path),
      },
    })),
  closeOthers: (scope, path) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [scope]: (state.tabs[scope] ?? []).filter((item) => item.path === path),
      },
    })),
  clear: () => set({ tabs: {}, recent: {} }),
}));
useSession.subscribe((state, previous) => {
  if (state.generation !== previous.generation)
    useWorkspaceTabs.getState().clear();
});
