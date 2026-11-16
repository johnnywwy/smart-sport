import { Button, SearchField, Spinner } from "@heroui/react";
import type { scopeSchoolsSchema } from "@smart-sport/contracts";
import type { SchoolChoice } from "../../types/school";
import "./SchoolOptions.css";

type SchoolPage = ReturnType<typeof scopeSchoolsSchema.parse>;
export function SchoolOptions({
  data,
  query,
  status,
  recent = [],
  onQueryChange,
  onSelect,
}: {
  data: SchoolPage | undefined;
  query: { keyword: string; page: number };
  status: { loading: boolean; error: boolean; retry: () => void };
  recent?: readonly SchoolChoice[];
  onQueryChange: (query: { keyword: string; page: number }) => void;
  onSelect: (school: SchoolChoice) => void;
}) {
  const option = (school: SchoolChoice) => (
    <Button
      key={school.id}
      variant="ghost"
      className="school-option"
      onPress={() => onSelect(school)}
    >
      <span>{school.name}</span>
      <small>{school.regionName}</small>
    </Button>
  );
  return (
    <div className="school-options">
      <SearchField
        aria-label="搜索学校名称"
        value={query.keyword}
        onChange={(keyword) => onQueryChange({ keyword, page: 1 })}
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="搜索学校名称" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <div className="school-options-list">
        {!query.keyword && recent.length > 0 && (
          <>
            <p className="school-options-caption">最近进过的学校</p>
            {recent.map(option)}
          </>
        )}
        <p className="school-options-caption">可选学校</p>
        {status.loading ? (
          <div className="school-options-state" role="status">
            <Spinner size="sm" />
            正在加载学校…
          </div>
        ) : status.error ? (
          <div className="school-options-state" role="alert">
            学校加载失败
            <Button size="sm" variant="secondary" onPress={status.retry}>
              重新加载
            </Button>
          </div>
        ) : !data?.items.length ? (
          <p className="school-options-state" role="status">
            {query.keyword
              ? "没有找到符合条件的学校"
              : "暂无可选学校，请联系管理员确认负责范围。"}
          </p>
        ) : (
          data.items
            .filter((row) => row.allowedActions.includes("view"))
            .map(option)
        )}
      </div>
      {data && !status.error && (
        <div className="school-options-pagination">
          <span>共 {data.total} 所</span>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={status.loading || query.page <= 1}
            onPress={() => onQueryChange({ ...query, page: query.page - 1 })}
          >
            上一页
          </Button>
          <span>{query.page}</span>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={
              status.loading || query.page * data.pageSize >= data.total
            }
            onPress={() => onQueryChange({ ...query, page: query.page + 1 })}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
