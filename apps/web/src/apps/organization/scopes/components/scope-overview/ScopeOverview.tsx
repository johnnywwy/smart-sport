import { Button, Chip } from "@heroui/react";
import type { ScopeOption } from "@smart-sport/contracts";
import "./ScopeOverview.css";
export function ScopeOverview({
  title,
  scopes,
  schoolCount,
  editable,
  onEdit,
}: {
  title: string;
  scopes: readonly ScopeOption[];
  schoolCount?: number;
  editable: boolean;
  onEdit: () => void;
}) {
  return (
    <section className="scope-overview" aria-label={title}>
      <div className="scope-overview-values">
        <strong>{title}</strong>
        {scopes.length ? (
          scopes.map((scope) => (
            <Chip
              key={`${scope.type}:${scope.value}`}
              size="sm"
              variant="soft"
              color={scope.available ? "default" : "danger"}
            >
              {scope.name}
            </Chip>
          ))
        ) : (
          <span>尚未配置</span>
        )}
        {schoolCount !== undefined && (
          <span className="scope-overview-count">
            覆盖 {schoolCount} 所启用学校（已去重）
          </span>
        )}
      </div>
      {editable && (
        <Button variant="secondary" onPress={onEdit}>
          编辑范围
        </Button>
      )}
    </section>
  );
}
