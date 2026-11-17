import type { ReactNode } from "react";

export type FormErrors = Record<string, string[]>;
export type FormSchema<T> = {
  safeParse: (input: unknown) =>
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly {
            path: readonly PropertyKey[];
            message?: string;
          }[];
        };
      };
};
type FieldBase = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  readOnly?: boolean;
  readOnlyReason?: string;
  validationMessage?: string;
  accessory?: ReactNode;
  fullWidth?: boolean;
};
export type FormField = FieldBase &
  (
    | {
        type?: "text" | "password" | "email" | "tel" | "date" | "number";
        autoComplete?: string;
      }
    | { type: "textarea" }
    | { type: "checkbox" }
    | {
        type: "custom";
        render: (state: {
          value: unknown;
          disabled: boolean;
          invalid: boolean;
          errorId: string;
          onChange: (value: unknown) => void;
        }) => ReactNode;
      }
    | {
        type: "select";
        options: readonly { value: string | number | boolean; label: string }[];
      }
  );
export type FormSubmissionContext = {
  idempotencyKey: string;
  signal: AbortSignal;
};
export type FormSnapshot<T> = { values: Partial<T>; version?: number };
export type FormRenderState = {
  values: Readonly<Record<string, unknown>>;
  errors: FormErrors;
  disabled: boolean;
  setValue: (name: string, value: unknown) => void;
};
export type SchemaFormProps<T> = {
  schema: FormSchema<T>;
  fields: readonly FormField[];
  submitLabel: string;
  onSubmit: (values: T, context: FormSubmissionContext) => Promise<void>;
  initialValues?: Partial<T>;
  version?: number;
  /** 换身份、记录或重新打开表单时改变，重置数据及幂等键。 */
  scopeKey?: string;
  errors?: FormErrors | undefined;
  disabled?: boolean;
  appearance?: "auth" | "default";
  columns?: 1 | 2;
  rule?: string;
  onCancel?: () => void;
  onReload?: () => Promise<FormSnapshot<T>>;
  onPendingChange?: (pending: boolean) => void;
  beforeFields?: ReactNode;
  children?: ReactNode | ((state: FormRenderState) => ReactNode);
};
