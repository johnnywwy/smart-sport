import { ListBox, Pagination, Select } from "@heroui/react";
import { tablePageNumbers } from "../../table-state";
import type { TableQuery } from "../../types";
import "./TablePagination.css";

export function TablePagination({
  query,
  total,
  disabled,
  onChange,
  pageSizes = true,
}: {
  query: TableQuery;
  total: number;
  disabled: boolean;
  onChange: (patch: Partial<TableQuery>) => void;
  pageSizes?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const numbers = tablePageNumbers(query.page, pages);
  return (
    <Pagination className="data-table-pagination" aria-label="列表分页">
      <Pagination.Summary>共 {total.toLocaleString()} 条</Pagination.Summary>
      <div className="data-table-pagination-controls">
        {pageSizes && (
          <Select
            aria-label="每页条数"
            value={String(query.pageSize)}
            onChange={(value) => {
              if (value !== null) onChange({ pageSize: Number(value) });
            }}
            isDisabled={disabled}
            className="data-table-page-size"
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {[10, 20, 50, 100].map((size) => (
                  <ListBox.Item
                    key={size}
                    id={String(size)}
                    textValue={`${size} 条/页`}
                  >
                    {size} 条/页
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        )}
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous
              aria-label="上一页"
              isDisabled={disabled || query.page <= 1}
              onPress={() => onChange({ page: query.page - 1 })}
            >
              <Pagination.PreviousIcon />
            </Pagination.Previous>
          </Pagination.Item>
          {numbers[0] !== 1 && (
            <Pagination.Item>
              <Pagination.Link
                aria-label="第 1 页"
                isDisabled={disabled}
                onPress={() => onChange({ page: 1 })}
              >
                1
              </Pagination.Link>
            </Pagination.Item>
          )}
          {(numbers[0] ?? 1) > 2 && (
            <Pagination.Item>
              <Pagination.Ellipsis />
            </Pagination.Item>
          )}
          {numbers.map((page) => (
            <Pagination.Item key={page}>
              <Pagination.Link
                aria-label={`第 ${page} 页`}
                isActive={query.page === page}
                isDisabled={disabled}
                onPress={() => onChange({ page })}
              >
                {page}
              </Pagination.Link>
            </Pagination.Item>
          ))}
          {(numbers.at(-1) ?? pages) < pages - 1 && (
            <Pagination.Item>
              <Pagination.Ellipsis />
            </Pagination.Item>
          )}
          {numbers.at(-1) !== pages && (
            <Pagination.Item>
              <Pagination.Link
                aria-label={`第 ${pages} 页`}
                isDisabled={disabled}
                onPress={() => onChange({ page: pages })}
              >
                {pages}
              </Pagination.Link>
            </Pagination.Item>
          )}
          <Pagination.Item>
            <Pagination.Next
              aria-label="下一页"
              isDisabled={disabled || query.page >= pages}
              onPress={() => onChange({ page: query.page + 1 })}
            >
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </div>
    </Pagination>
  );
}
