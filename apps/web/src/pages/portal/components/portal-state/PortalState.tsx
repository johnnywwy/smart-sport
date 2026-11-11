import "./PortalState.css";
import { Button, Card, Spinner } from "@heroui/react";
export function PortalState({
  state,
  onRetry,
}: {
  state: "loading" | "error" | "empty";
  onRetry?: () => void;
}) {
  return (
    <Card
      className="portal-state"
      role={state === "error" ? "alert" : "status"}
    >
      {state === "loading" && <Spinner size="sm" aria-label="正在加载应用" />}
      <Card.Title>
        {state === "loading"
          ? "正在加载…"
          : state === "error"
            ? "暂时无法加载"
            : "暂无可用应用"}
      </Card.Title>
      <Card.Description>
        {state === "empty"
          ? "请联系管理员为当前身份分配应用权限。"
          : state === "error"
            ? "请检查网络连接后重试。"
            : "正在获取当前身份的应用与权限。"}
      </Card.Description>
      {onRetry && (
        <Button variant="secondary" onPress={onRetry}>
          重新加载
        </Button>
      )}
    </Card>
  );
}
