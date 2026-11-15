import type { ScopeOption, ScopeType } from "@smart-sport/contracts";

export type ScopeLoadState = {
  loading: boolean;
  error: boolean;
  retry: () => void;
};
export type ScopeRegionBranch = ScopeLoadState & {
  parent: string | null;
  items: readonly ScopeOption[];
  loaded: boolean;
};
export type ScopeCandidates = {
  scopeKey: string;
  allowedTypes: readonly ScopeType[];
  type: "region" | "school";
  onTypeChange: (type: "region" | "school") => void;
  regions: {
    branches: readonly ScopeRegionBranch[];
    expanded: ReadonlySet<string>;
    onExpandedChange: (values: Set<string>) => void;
  };
  schools: ScopeLoadState & {
    items: readonly ScopeOption[];
    total: number;
    page: number;
    pageSize: number;
    keyword: string;
    onKeywordChange: (keyword: string) => void;
    onPageChange: (page: number) => void;
  };
};
