import "./IdentityListState.css";
import { Button, Spinner } from "@heroui/react";

type IdentityListStateProps = {
  state: "loading" | "error" | "empty" | "no-results";
  onRetry?: () => void;
};

export function IdentityListState({ state, onRetry }: IdentityListStateProps) {
  if (state === "loading")
    return (
      <div className="select-org-state" role="status">
        <Spinner size="lg" />
        <p>正在加载组织身份…</p>
      </div>
    );
  const content = {
    error: ["暂时无法加载组织", "请检查网络后重试。"],
    empty: ["暂无可进入的组织", "请联系组织管理员为你添加身份。"],
    "no-results": ["没有找到匹配的组织", "请尝试其他组织名称或身份信息。"],
  }[state];
  return (
    <div className="select-org-state" role="status">
      <p className="font-semibold text-[#18181b]">{content[0]}</p>
      <p className="text-sm text-[#63636b]">{content[1]}</p>
      {state === "error" && onRetry && (
        <Button variant="secondary" onPress={onRetry}>
          重新加载
        </Button>
      )}
    </div>
  );
}
