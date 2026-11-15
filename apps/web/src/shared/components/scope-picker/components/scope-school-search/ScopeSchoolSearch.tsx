import { SearchField } from "@heroui/react";
import type { ScopeOption } from "@smart-sport/contracts";
import { TablePagination } from "../../../data-table/components/table-pagination/TablePagination";
import { coveringRegion, scopeKey } from "../../scope-selection";
import type { ScopeCandidates } from "../../types";
import { ScopeLoadState } from "../scope-load-state/ScopeLoadState";
import { ScopeOptionCheck } from "../scope-option-check/ScopeOptionCheck";
import "./ScopeSchoolSearch.css";

export function ScopeSchoolSearch({
  data,
  regions,
  value,
  disabled,
  onToggle,
}: {
  data: ScopeCandidates["schools"];
  regions: readonly ScopeOption[];
  value: readonly ScopeOption[];
  disabled: boolean;
  onToggle: (item: ScopeOption, checked: boolean) => void;
}) {
  return (
    <div className="scope-school-search">
      <SearchField
        aria-label="搜索学校名称"
        value={data.keyword}
        onChange={data.onKeywordChange}
        maxLength={100}
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="搜索学校名称" />
          <SearchField.ClearButton aria-label="清空学校搜索" />
        </SearchField.Group>
      </SearchField>
      <ScopeLoadState
        state={data}
        empty={data.items.length === 0}
        noun="学校"
      />
      {!data.loading && !data.error && (
        <>
          <div className="scope-school-options">
            {data.items.map((item) => (
              <ScopeOptionCheck
                key={scopeKey(item)}
                item={item}
                selected={value.some(
                  (entry) => scopeKey(entry) === scopeKey(item),
                )}
                coveredBy={coveringRegion(item, value, regions)?.name}
                disabled={disabled}
                onChange={(checked) => onToggle(item, checked)}
              />
            ))}
          </div>
          <TablePagination
            query={{
              page: data.page,
              pageSize: data.pageSize,
              keyword: data.keyword,
              filters: {},
              deleted: false,
            }}
            total={data.total}
            disabled={false}
            onChange={(patch) => data.onPageChange(patch.page ?? 1)}
            pageSizes={false}
          />
        </>
      )}
      <p className="scope-picker-hint">
        仅显示当前组织边界内的学校。切换分页或搜索不会清空已选学校。
      </p>
    </div>
  );
}
