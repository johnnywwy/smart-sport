import { Button, Spinner } from "@heroui/react";
import "./NavigationState.css";
export function NavigationState({
  state,
  onRetry,
}: {
  state: "loading" | "error" | "empty";
  onRetry?: () => void;
}) {
  return (
    <div
      className="navigation-state"
      role={state === "error" ? "alert" : "status"}
    >
      {state === "loading" ? (
        <>
          <Spinner size="sm" />
          <p>正在加载可用模块…</p>
        </>
      ) : state === "error" ? (
        <>
          <h2>加载失败</h2>
          <p>请稍后重试。</p>
          <Button variant="secondary" onPress={() => onRetry?.()}>
            重新加载
          </Button>
        </>
      ) : (
        <>
          <h2>暂无可用模块</h2>
          <p>请联系管理员为你分配角色和权限。</p>
        </>
      )}
    </div>
  );
}
