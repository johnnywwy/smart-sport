import { Button, Spinner } from "@heroui/react";
import type { ScopeLoadState as LoadState } from "../../types";
import "./ScopeLoadState.css";

export function ScopeLoadState({
  state,
  empty,
  noun,
}: {
  state: LoadState;
  empty: boolean;
  noun: string;
}) {
  if (state.loading)
    return (
      <div className="scope-load-state" role="status">
        <Spinner size="sm" />
        正在加载{noun}…
      </div>
    );
  if (state.error)
    return (
      <div className="scope-load-state" role="alert">
        <span>{noun}加载失败，请重新加载。</span>
        <Button size="sm" variant="secondary" onPress={state.retry}>
          重新加载{noun}
        </Button>
      </div>
    );
  return empty ? (
    <p className="scope-load-state">当前组织边界内暂无可选{noun}。</p>
  ) : null;
}
