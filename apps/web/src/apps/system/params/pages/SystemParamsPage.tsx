import type { SystemParam } from "@smart-sport/contracts";
import { useState } from "react";
import { EditParamDialog } from "../components/edit-param-dialog/EditParamDialog";
import { ParamList } from "../components/param-list/ParamList";
import { useParams } from "../hooks/use-params";
import { initialParamQuery } from "../param-state";
import "./SystemParamsPage.css";
export function SystemParamsPage({ identityId }: { identityId: string }) {
  const [query, setQuery] = useState(initialParamQuery);
  const [editing, setEditing] = useState<SystemParam | null>(null);
  const data = useParams(identityId, query);
  return (
    <div className="system-params-page">
      <ParamList
        identityId={identityId}
        data={
          data.items.isError
            ? {
                items: [],
                total: 0,
                page: query.page,
                pageSize: query.pageSize,
              }
            : (data.items.data ?? {
                items: [],
                total: 0,
                page: query.page,
                pageSize: query.pageSize,
              })
        }
        query={query}
        onQueryChange={setQuery}
        status={{
          loading: data.items.isPending,
          error: data.items.isError,
          onRetry: () => void data.items.refetch(),
        }}
        onEdit={setEditing}
      />
      <p className="system-params-note">
        修改会记入平台操作记录。具体生效范围见各项说明，已有服务和撤销截止时间不变。
      </p>
      {editing && (
        <EditParamDialog
          key={`${identityId}:${editing.id}`}
          identityId={identityId}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(values, context) => data.save(editing.id, values, context)}
          onReload={() => data.reload(editing.id)}
        />
      )}
    </div>
  );
}
