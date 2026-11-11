import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { type ReactNode, useRef, useState } from "react";

type Field = {
  name: string;
  label: string;
  type?: "text" | "password";
  autoComplete?: string;
  placeholder?: string;
  validationMessage?: string;
  accessory?: ReactNode;
};
type SchemaFormProps<T> = {
  schema: {
    safeParse: (input: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: readonly { path: readonly PropertyKey[] }[] };
        };
  };
  fields: Field[];
  submitLabel: string;
  onSubmit: (values: T) => Promise<void>;
  errors?: Record<string, string[]> | undefined;
  disabled?: boolean;
  children?: ReactNode;
};

// 认证表单只消费已有契约；版本与业务提交能力在 T-158 扩展。
export function SchemaForm<T>({
  schema,
  fields,
  submitLabel,
  onSubmit,
  errors,
  disabled,
  children,
}: SchemaFormProps<T>) {
  const [validation, setValidation] = useState<Record<string, string[]>>({});
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(
    () => new Set(),
  );
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  return (
    <Form
      className="schema-form flex flex-col"
      validationBehavior="aria"
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current || disabled) return;
        setDismissedErrors(new Set());
        const form = event.currentTarget;
        const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
        if (!parsed.success) {
          const next: Record<string, string[]> = {};
          for (const issue of parsed.error.issues) {
            const key = String(issue.path[0] ?? "_form");
            next[key] ??= [];
            const field = fields.find((item) => item.name === key);
            next[key].push(field?.validationMessage ?? "请填写有效内容");
          }
          setValidation(next);
          return;
        }
        setValidation({});
        submitting.current = true;
        setPending(true);
        try {
          await onSubmit(parsed.data);
        } finally {
          // 密码只存在输入框内，提交结束即清空，避免留在页面或查询缓存里。
          for (const input of form.querySelectorAll<HTMLInputElement>(
            'input[type="password"]',
          ))
            input.value = "";
          submitting.current = false;
          setPending(false);
        }
      }}
    >
      {fields.map((field) => {
        const message =
          validation[field.name]?.[0] ??
          (dismissedErrors.has(field.name)
            ? undefined
            : errors?.[field.name]?.[0]);
        return (
          <TextField
            key={field.name}
            name={field.name}
            type={field.type ?? "text"}
            {...(field.autoComplete
              ? { autoComplete: field.autoComplete }
              : {})}
            isRequired
            isDisabled={pending || Boolean(disabled)}
            isInvalid={Boolean(message)}
            className="schema-form-field w-full"
          >
            <div className="flex items-center justify-between">
              <Label>{field.label}</Label>
              {field.accessory}
            </div>
            <Input
              {...(field.placeholder ? { placeholder: field.placeholder } : {})}
              onChange={() => {
                setValidation((current) => {
                  if (!(field.name in current)) return current;
                  const next = { ...current };
                  delete next[field.name];
                  return next;
                });
                setDismissedErrors((current) => {
                  if (current.has(field.name)) return current;
                  const next = new Set(current);
                  next.add(field.name);
                  return next;
                });
              }}
            />
            <FieldError className="schema-form-field-error">
              {message}
            </FieldError>
          </TextField>
        );
      })}
      {children}
      <Button
        type="submit"
        className="auth-submit w-full"
        isDisabled={pending || Boolean(disabled)}
      >
        {pending ? "正在处理…" : submitLabel}
      </Button>
    </Form>
  );
}
