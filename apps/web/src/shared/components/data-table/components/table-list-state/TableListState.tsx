import { Button, Spinner } from "@heroui/react";
import "./TableListState.css";

export function TableListState({
  loading,
  error,
  onRetry,
}: {
  loading?: boolean | undefined;
  error?: boolean | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div
      className="data-table-state"
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      {loading ? (
        <>
          <Spinner size="sm" />
          <span>正在加载…</span>
        </>
      ) : error ? (
        <>
          <span>加载失败，请重试</span>
          {onRetry && (
            <Button variant="secondary" size="sm" onPress={onRetry}>
              重新加载
            </Button>
          )}
        </>
      ) : (
        <span>暂无数据</span>
      )}
    </div>
  );
}
