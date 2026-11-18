import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { useState } from "react";
import type { TableQuery } from "../../../../../shared/components/data-table/types";
import { auditActions } from "../../audit-labels";
import { auditQueryString } from "../../audit-state";
import "./AuditFilters.css";
export function AuditFilters({
  query,
  onChange,
  disabled,
}: {
  query: TableQuery;
  onChange: (query: TableQuery) => void;
  disabled: boolean;
}) {
  const [filters, setFilters] = useState(query.filters);
  const [invalid, setInvalid] = useState(false);
  const change = (name: string, value: string) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setInvalid(false);
  };
  return (
    <Form
      className="audit-filters"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          auditQueryString("organization", { ...query, filters });
        } catch {
          setInvalid(true);
          return;
        }
        onChange({ ...query, page: 1, filters });
      }}
    >
      <Select
        aria-label="操作类型"
        placeholder="操作类型"
        value={filters.action || null}
        onChange={(value) =>
          change(
            "action",
            value === null || value === "__all" ? "" : String(value),
          )
        }
        isDisabled={disabled}
        className="audit-action-filter"
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="__all" textValue="全部操作">
              全部操作
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {auditActions.map(([id, label]) => (
              <ListBox.Item key={id} id={id} textValue={label}>
                {label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {(
        [
          ["from", "开始日期"],
          ["to", "结束日期"],
        ] as const
      ).map(([name, label]) => (
        <TextField
          key={name}
          type="text"
          validationBehavior="aria"
          value={filters[name] ?? ""}
          onChange={(value) => change(name, value)}
          isDisabled={disabled}
          isInvalid={invalid && name === "to"}
          className="audit-date-filter"
        >
          <Label>{label}</Label>
          <Input placeholder="YYYY-MM-DD" />
          {name === "to" && (
            <FieldError>结束日期不能早于开始日期，请检查日期范围。</FieldError>
          )}
        </TextField>
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
          setFilters({});
          setInvalid(false);
          onChange({ ...query, page: 1, keyword: "", filters: {} });
        }}
      >
        重置
      </Button>
    </Form>
  );
}
