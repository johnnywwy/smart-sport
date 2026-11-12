import { Button } from "@heroui/react";
import "./FormFeedback.css";
export function FormFeedback({
  message,
  conflict,
  pending,
  onReload,
}: {
  message: string;
  conflict: boolean;
  pending: boolean;
  onReload?: (() => void) | undefined;
}) {
  if (!message) return null;
  return (
    <div className="schema-form-feedback" role="alert">
      <p>{message}</p>
      {conflict &&
        (onReload ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={onReload}
            isDisabled={pending}
          >
            重新加载
          </Button>
        ) : (
          <p>请关闭表单后重新打开，获取最新内容。</p>
        ))}
    </div>
  );
}
