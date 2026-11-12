import { Button } from "@heroui/react";
import "./FormActions.css";
export function FormActions({
  label,
  pending,
  disabled,
  appearance,
  onCancel,
}: {
  label: string;
  pending: boolean;
  disabled: boolean;
  appearance: "auth" | "default";
  onCancel?: (() => void) | undefined;
}) {
  return (
    <div className={`schema-form-actions schema-form-actions-${appearance}`}>
      {onCancel && (
        <Button
          variant="secondary"
          className="schema-form-cancel"
          isDisabled={pending}
          onPress={onCancel}
        >
          取消
        </Button>
      )}
      <Button
        type="submit"
        className={
          appearance === "auth" ? "auth-submit w-full" : "schema-form-submit"
        }
        isDisabled={disabled}
        isPending={pending}
      >
        {pending ? (appearance === "auth" ? "正在处理…" : "保存中…") : label}
      </Button>
    </div>
  );
}
