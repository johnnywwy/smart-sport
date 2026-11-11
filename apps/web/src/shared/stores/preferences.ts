import { create } from "zustand";
import { persist } from "zustand/middleware";

type Preferences = {
  dark: boolean;
  sidebarOpen: boolean;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
};

export const usePreferences = create(
  persist<Preferences>(
    (set) => ({
      dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      sidebarOpen: true,
      toggleTheme: () => set((state) => ({ dark: !state.dark })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    { name: "smart-sport-ui" },
  ),
);
