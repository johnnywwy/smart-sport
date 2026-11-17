import {
  Checkbox,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import { useId } from "react";
import type { FormField as Field } from "../../types";
import "./FormField.css";

type Props = {
  field: Field;
  value: unknown;
  error?: string | undefined;
  disabled: boolean;
  showRequired: boolean;
  onChange: (name: string, value: unknown) => void;
};
export function FormField({
  field,
  value,
  error,
  disabled,
  showRequired,
  onChange,
}: Props) {
  const errorId = useId();
  // DOM 表单的 reset/submit 等具名属性不能被业务字段覆盖；提交仍使用原契约字段名。
  const inputName = `field-${field.name}`;
  const className = `schema-form-field${field.fullWidth ? " schema-form-field-wide" : ""}`;
  const required = field.required !== false;
  const description = field.readOnly
    ? (field.readOnlyReason ?? "此字段不可修改。")
    : field.description;
  const label = (
    <div className="schema-form-field-label">
      <Label>
        {field.label}
        {required && showRequired && <span aria-hidden="true"> *</span>}
      </Label>
      {field.accessory}
    </div>
  );
  const notes = (
    <>
      {description && <Description>{description}</Description>}
      <FieldError className="schema-form-field-error">{error}</FieldError>
    </>
  );
  if (field.type === "custom") {
    return (
      <div className={`${className} schema-form-custom-field`}>
        {label}
        {field.render({
          value,
          disabled: disabled || Boolean(field.readOnly),
          invalid: Boolean(error),
          errorId,
          onChange: (next) => onChange(field.name, next),
        })}
        {description && <Description>{description}</Description>}
        {error && (
          <p id={errorId} className="schema-form-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
  if (field.type === "select" && !field.readOnly) {
    return (
      <Select
        name={inputName}
        value={value === "" || value == null ? null : String(value)}
        onChange={(selected) => {
          onChange(
            field.name,
            field.options.find((option) => String(option.value) === selected)
              ?.value ?? "",
          );
        }}
        isRequired={required}
        isInvalid={Boolean(error)}
        isDisabled={disabled}
        placeholder={field.placeholder ?? "请选择"}
        className={className}
      >
        {label}
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {field.options.map((option) => (
              <ListBox.Item
                key={option.value}
                id={String(option.value)}
                textValue={option.label}
              >
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        {notes}
      </Select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <Checkbox
        name={inputName}
        isSelected={Boolean(value)}
        onChange={(selected) => onChange(field.name, selected)}
        isRequired={required}
        isReadOnly={Boolean(field.readOnly)}
        isDisabled={disabled}
        isInvalid={Boolean(error)}
        className={className}
      >
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Label>
            {field.label}
            {required && showRequired && <span aria-hidden="true"> *</span>}
          </Label>
        </Checkbox.Content>
        {notes}
      </Checkbox>
    );
  }
  const displayValue =
    field.type === "select"
      ? (field.options.find((option) => option.value === value)?.label ??
        "未设置")
      : String(value ?? "");
  const inputType =
    field.type === "textarea" || field.type === "select"
      ? "text"
      : (field.type ?? "text");
  return (
    <TextField
      name={inputName}
      type={inputType}
      {...("autoComplete" in field && field.autoComplete
        ? { autoComplete: field.autoComplete }
        : {})}
      value={displayValue}
      onChange={(next) =>
        onChange(
          field.name,
          field.type === "number"
            ? next === ""
              ? undefined
              : Number(next)
            : next,
        )
      }
      isRequired={required}
      isDisabled={disabled}
      isReadOnly={Boolean(field.readOnly)}
      isInvalid={Boolean(error)}
      className={className}
    >
      {label}
      {field.type === "textarea" ? (
        <TextArea placeholder={field.placeholder ?? ""} />
      ) : (
        <Input placeholder={field.placeholder ?? ""} />
      )}
      {notes}
    </TextField>
  );
}
