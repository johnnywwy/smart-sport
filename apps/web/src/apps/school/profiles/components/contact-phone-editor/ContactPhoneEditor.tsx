import { Button, Input, TextField } from "@heroui/react";
import { useId } from "react";
import "./ContactPhoneEditor.css";

export function ContactPhoneEditor({
  value,
  maskedPhone,
  disabled,
  invalid,
  errorId,
  onChange,
}: {
  value: unknown;
  maskedPhone: string | null;
  disabled: boolean;
  invalid: boolean;
  errorId: string;
  onChange: (value: string | null | undefined) => void;
}) {
  const descriptionId = useId();
  return (
    <div className="school-contact-editor">
      <TextField
        aria-label="联系电话"
        aria-describedby={`${descriptionId}${invalid ? ` ${errorId}` : ""}`}
        type="tel"
        value={typeof value === "string" ? value : ""}
        onChange={(next) => onChange(next === "" ? undefined : next)}
        isDisabled={disabled}
        isInvalid={invalid}
      >
        <Input placeholder="输入新号码以替换" />
      </TextField>
      <div className="school-contact-hint">
        <span id={descriptionId}>
          {value === null
            ? "保存后清空原号码"
            : maskedPhone
              ? `当前：${maskedPhone}；不填写则保留`
              : "未填写联系电话"}
        </span>
        {maskedPhone && (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={disabled}
            onPress={() => onChange(value === null ? undefined : null)}
          >
            {value === null ? "保留原号码" : "清空原号码"}
          </Button>
        )}
      </div>
    </div>
  );
}
