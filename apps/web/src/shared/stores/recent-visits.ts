import type { AvailableApp } from "@smart-sport/contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";
export type RecentVisit = {
  appCode: AvailableApp["code"];
  name: string;
  path: string;
};
type VisitsState = {
  byIdentity: Record<string, RecentVisit[]>;
  record: (identityId: string, visit: RecentVisit) => void;
};
export const useRecentVisits = create(
  persist<VisitsState>(
    (set) => ({
      byIdentity: {},
      record: (identityId, visit) =>
        set((state) => ({
          byIdentity: {
            ...state.byIdentity,
            [identityId]: [
              visit,
              ...(state.byIdentity[identityId] ?? []).filter(
                ({ path }) => path !== visit.path,
              ),
            ].slice(0, 5),
          },
        })),
    }),
    { name: "smart-sport-recent-visits", version: 1 },
  ),
);
