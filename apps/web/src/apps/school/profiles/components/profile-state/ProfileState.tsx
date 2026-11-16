import { Button, Spinner } from "@heroui/react";
import { ApiError } from "../../../../../shared/errors/api-error";
import "./ProfileState.css";

export function ProfileState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const unavailable =
    error instanceof ApiError && (error.status === 404 || error.status === 403);
  return (
    <div className="school-profile-state" role={loading ? "status" : "alert"}>
      {loading ? (
        <>
          <Spinner size="sm" />
          <p>正在加载学校档案…</p>
        </>
      ) : (
        <>
          <h2>{unavailable ? "档案暂不可查看" : "档案加载失败"}</h2>
          <p>
            {unavailable
              ? "学校档案尚未建立，或当前身份没有查看权限，请联系管理员。"
              : "请检查网络连接后重试。"}
          </p>
          <Button variant="secondary" onPress={onRetry}>
            重新加载
          </Button>
        </>
      )}
    </div>
  );
}
