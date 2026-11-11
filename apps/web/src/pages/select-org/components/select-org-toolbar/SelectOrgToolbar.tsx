import "./SelectOrgToolbar.css";
import { SearchField } from "@heroui/react";

type SelectOrgToolbarProps = {
  count: number;
  query: string;
  onQueryChange: (value: string) => void;
};

export function SelectOrgToolbar({
  count,
  query,
  onQueryChange,
}: SelectOrgToolbarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-[#18181b]">
          选择要进入的组织
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-[#63636b]">
          你的账号有 {count} 个身份。进入后可以随时在右上角切换。
        </p>
      </div>
      <SearchField
        aria-label="搜索组织名称"
        value={query}
        onChange={onQueryChange}
        className="select-org-search"
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="搜索组织名称" />
          <SearchField.ClearButton aria-label="清空搜索" />
        </SearchField.Group>
      </SearchField>
    </div>
  );
}
