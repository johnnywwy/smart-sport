import { Button } from "@heroui/react";
import { scopeSchoolsQuerySchema } from "@smart-sport/contracts";
import "./ScopeVisibleCell.css";
import { useVisibleScope } from "../hooks/use-visible-scope";
/** 只为当前列表页的成员查询摘要，返回一条学校明细即可获得完整去重总数。 */
export function ScopeVisibleCell({
  identityId,
  targetId,
  active,
  onOpen,
}: {
  identityId: string;
  targetId: string;
  active: boolean;
  onOpen: () => void;
}) {
  const query = useVisibleScope(
    identityId,
    targetId,
    scopeSchoolsQuerySchema.parse({ pageSize: 1 }),
    active,
  );
  if (!active) return <span>已停用</span>;
  if (query.isPending) return <span role="status">计算中…</span>;
  if (query.isError)
    return (
      <Button size="sm" variant="ghost" onPress={() => void query.refetch()}>
        重试计算
      </Button>
    );
  const data = query.data;
  const label = !data.supported
    ? "暂未开放"
    : data.warnings.includes("permission_not_granted")
      ? "未获查看权限"
      : `${data.schoolCount} 所学校`;
  return (
    <Button
      size="sm"
      className={
        data.warnings.includes("missing_department")
          ? "scope-visible-warning"
          : ""
      }
      variant="ghost"
      onPress={onOpen}
      aria-label={`实际可见：${label}，查看范围详情`}
    >
      {label}
    </Button>
  );
}
