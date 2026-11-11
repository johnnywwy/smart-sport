import { create } from "zustand";

type Notice = { message: string };
type ApiEvents = {
  notices: Notice[];
  navigation: "login" | "portal" | null;
  availableVersion: string | null;
  notify: (message: string) => void;
  drainNotices: () => Notice[];
  navigate: (target: "login" | "portal") => void;
  consumeNavigation: () => void;
  observeVersion: (version: string) => void;
};

export const useApiEvents = create<ApiEvents>((set, get) => ({
  notices: [],
  navigation: null,
  availableVersion: null,
  notify: (message) =>
    set((state) => ({
      notices: state.notices.some((notice) => notice.message === message)
        ? state.notices
        : [...state.notices, { message }],
    })),
  drainNotices: () => {
    const notices = get().notices;
    set({ notices: [] });
    return notices;
  },
  navigate: (navigation) => set({ navigation }),
  consumeNavigation: () => set({ navigation: null }),
  observeVersion: (version) => {
    if (version !== __APP_VERSION__) set({ availableVersion: version });
  },
}));
