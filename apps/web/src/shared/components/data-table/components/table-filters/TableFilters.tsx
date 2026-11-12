import { Button, Form, Input, ListBox, Select, TextField } from "@heroui/react";
import { useState } from "react";
import type { TableConfig, TableQuery } from "../../types";
import "./TableFilters.css";

export function TableFilters<T>({
  config,
  query,
  onChange,
  disabled,
}: {
  config: TableConfig<T>;
  query: TableQuery;
  onChange: (patch: Partial<TableQuery>) => void;
  disabled: boolean;
}) {
  const [keyword, setKeyword] = useState(query.keyword);
  const [filters, setFilters] = useState(query.filters);
  return (
    <Form
      className="data-table-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ keyword: keyword.trim(), filters });
      }}
    >
      <TextField
        aria-label={config.searchPlaceholder ?? "搜索"}
        value={keyword}
        onChange={setKeyword}
        isDisabled={disabled}
        className="data-table-search"
      >
        <Input placeholder={config.searchPlaceholder ?? "搜索"} type="search" />
      </TextField>
      {config.filters?.map((filter) => (
        <Select
          key={filter.id}
          aria-label={filter.label}
          placeholder={filter.label}
          value={filters[filter.id] || null}
          onChange={(value) =>
            setFilters((current) => ({
              ...current,
              [filter.id]:
                value === null || value === "__all" ? "" : String(value),
            }))
          }
          isDisabled={disabled}
          className="data-table-filter"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="__all" textValue={filter.label}>
                {filter.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {filter.options.map((option) => (
                <ListBox.Item
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                >
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ))}
      <Button
        type="submit"
        className="data-table-button data-table-query"
        isDisabled={disabled}
      >
        查询
      </Button>
      <Button
        className="data-table-button data-table-secondary"
        isDisabled={disabled}
        onPress={() => {
          setKeyword("");
          setFilters({});
          onChange({ keyword: "", filters: {} });
        }}
      >
        重置
      </Button>
    </Form>
  );
}
