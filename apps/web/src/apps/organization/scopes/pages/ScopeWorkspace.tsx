import { Button, Spinner } from "@heroui/react";
import type { ScopeOption } from "@smart-sport/contracts";
import { useState } from "react";
import { useScopeOptions } from "../../../../shared/hooks/use-scope-options";
import { ScopeEditor } from "../components/scope-editor/ScopeEditor";
import { ScopeOverview } from "../components/scope-overview/ScopeOverview";
import { ScopePreview } from "../components/scope-preview/ScopePreview";
import { type ScopeDetails, useScopeDetails } from "../hooks/use-scope-details";
import { useScopePreview } from "../hooks/use-scope-preview";
import type { ScopeTarget } from "../scope-state";
import { VisibleScopeWorkspace } from "./VisibleScopeWorkspace";
import "./ScopeWorkspace.css";

function DraftPreview({
  identityId,
  value,
}: {
  identityId: string;
  value: readonly ScopeOption[];
}) {
  const { query, waiting, unavailable } = useScopePreview(identityId, value);
  return (
    <ScopePreview
      data={query.data}
      loading={query.isPending}
      waiting={waiting}
      unavailable={unavailable}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );
}
export function ScopeWorkspace({
  identityId,
  target,
  active = true,
}: {
  identityId: string;
  target: ScopeTarget;
  active?: boolean;
}) {
  const data = useScopeDetails(identityId, target);
  // 编辑时冻结读取快照；后台重新查询不能覆盖用户尚未保存的选择。
  const [draft, setDraft] = useState<ScopeDetails | null>(null);
  const candidates = useScopeOptions({
    identityId,
    targetIdentityId: target.kind === "identity" ? target.id : undefined,
    allowedTypes: draft?.allowedTypes ?? [],
    enabled: !!draft,
  });
  const details = data.query.data;
  return (
    <div className="scope-workspace">
      {data.query.isPending ? (
        <div role="status">
          <Spinner size="sm" />
          正在读取负责范围…
        </div>
      ) : data.query.isError ? (
        <div role="alert">
          <p>负责范围读取失败。</p>
          <Button variant="secondary" onPress={() => void data.query.refetch()}>
            重新加载范围
          </Button>
        </div>
      ) : (
        details && (
          <>
            <ScopeOverview
              title={
                target.kind === "department" ? "部门负责范围" : "本人额外负责"
              }
              scopes={details.scopes}
              {...("schoolCount" in details
                ? { schoolCount: details.schoolCount }
                : {})}
              editable={
                details.allowedActions.includes("update") &&
                details.allowedTypes.length > 0
              }
              onEdit={() => setDraft(details)}
            />
            <p className="scope-workspace-hint">
              {target.kind === "department"
                ? "范围按部门分别配置，不自动继承上级；成员是否包含下级部门由角色的数据范围决定。"
                : "额外负责与角色范围合并后，仍受组织边界限制；配置范围不会增加操作权限。"}
            </p>
          </>
        )
      )}
      {target.kind === "identity" && (
        <VisibleScopeWorkspace
          identityId={identityId}
          targetId={target.id}
          targetName={target.name}
          active={active}
        />
      )}
      {draft && (
        <ScopeEditor
          targetName={target.name}
          details={draft}
          candidates={candidates}
          onSave={data.save}
          onReload={data.reload}
          onClose={() => setDraft(null)}
          renderPreview={(value) => (
            <DraftPreview identityId={identityId} value={value} />
          )}
        />
      )}
    </div>
  );
}
