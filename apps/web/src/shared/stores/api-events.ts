import { create } from "zustand";

export type Notice = {
  variant: "success" | "danger";
  title: string;
  message: string;
};
type ApiEvents = {
  notices: Notice[];
  navigation: "login" | "portal" | null;
  availableVersion: string | null;
  notifyError: (message: string, title?: string) => void;
  notifySuccess: (message: string, title?: string) => void;
  drainNotices: () => Notice[];
  navigate: (target: "login" | "portal") => void;
  consumeNavigation: () => void;
  observeVersion: (version: string) => void;
};

export const useApiEvents = create<ApiEvents>((set, get) => ({
  notices: [],
  navigation: null,
  availableVersion: null,
  notifyError: (message, title = "操作失败") =>
    set((state) => ({
      notices: state.notices.some(
        (notice) => notice.variant === "danger" && notice.message === message,
      )
        ? state.notices
        : [...state.notices, { variant: "danger", title, message }],
    })),
  notifySuccess: (message, title = "操作成功") =>
    set((state) => ({
      notices: state.notices.some(
        (notice) => notice.variant === "success" && notice.message === message,
      )
        ? state.notices
        : [...state.notices, { variant: "success", title, message }],
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
