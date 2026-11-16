import { Button, Spinner } from "@heroui/react";
import type { ScopePreview as Preview } from "@smart-sport/contracts";
import { ApiError } from "../../../../../shared/errors/api-error";
import "./ScopePreview.css";
export function ScopePreview({
  data,
  loading,
  waiting,
  unavailable,
  error,
  onRetry,
}: {
  data: Preview | undefined;
  loading: boolean;
  waiting: boolean;
  unavailable: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const noAccess = error instanceof ApiError && error.code === 11101;
  return (
    <div className="scope-draft-preview" aria-live="polite">
      {unavailable ? (
        <span>存在已失效范围，请移除后再预览和保存。</span>
      ) : waiting || loading ? (
        <>
          <Spinner size="sm" />
          <span>正在计算所选范围…</span>
        </>
      ) : error ? (
        <>
          <span>
            {noAccess
              ? "当前身份没有范围预览权限；保存仍由服务端校验。"
              : "范围预览失败，当前选择尚未保存。"}
          </span>
          {!noAccess && (
            <Button size="sm" variant="ghost" onPress={onRetry}>
              重试预览
            </Button>
          )}
        </>
      ) : data?.supported ? (
        <strong>当前选择覆盖 {data.schoolCount} 所启用学校（已去重）</strong>
      ) : (
        <span>当前组织的学校范围预览暂未开放。</span>
      )}
      <small>
        这是本次选择的范围数量，成员实际可见还取决于角色、部门与组织边界。
      </small>
    </div>
  );
}
