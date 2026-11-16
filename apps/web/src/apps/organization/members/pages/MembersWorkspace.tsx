import { Button } from "@heroui/react";
import type {
  createMemberResponseSchema,
  IdentitySummary,
  Member,
  memberDetailSchema,
} from "@smart-sport/contracts";
import { type ReactNode, useState } from "react";
import { AddDepartmentMembers } from "../components/add-department-members/AddDepartmentMembers";
import {
  BatchMembersDialog,
  type MemberBatchDraft,
} from "../components/batch-members-dialog/BatchMembersDialog";
import { CreateMemberDialog } from "../components/create-member-dialog/CreateMemberDialog";
import { MemberCreatedDialog } from "../components/member-created-dialog/MemberCreatedDialog";
import { MemberDetailPanel } from "../components/member-detail-panel/MemberDetailPanel";
import { MemberList } from "../components/member-list/MemberList";
import { MemberStatusDialog } from "../components/member-status-dialog/MemberStatusDialog";
import { useMembers } from "../hooks/use-members";
import { initialMemberQuery, memberQuery } from "../member-state";
import "./MembersWorkspace.css";
export function MembersWorkspace({
  identity,
  departmentId,
  departmentName,
  renderScopes,
  renderVisible,
}: {
  identity: IdentitySummary;
  renderVisible: (row: Member, onOpen: () => void) => ReactNode;
  renderScopes: (row: ReturnType<typeof memberDetailSchema.parse>) => ReactNode;
  departmentId?: string;
  departmentName?: string;
}) {
  const [query, setQuery] = useState(initialMemberQuery);
  const [selected, setSelected] = useState<string>();
  const [detailTab, setDetailTab] = useState("information");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<ReturnType<
    typeof createMemberResponseSchema.parse
  > | null>(null);
  const [status, setStatus] = useState<Member | null>(null);
  const [batch, setBatch] = useState<MemberBatchDraft | null>(null);
  const departmentMode = departmentName !== undefined;
  const data = useMembers(
    identity.id,
    memberQuery(query, departmentId),
    selected,
    departmentMode,
  );
  return (
    <section
      className="members-workspace"
      aria-label={departmentMode ? "部门成员管理" : "成员账号管理"}
    >
      {data.options.isError && (
        <div className="members-options-error" role="alert">
          <span>成员表单选项加载失败，暂时无法分配部门和角色。</span>
          <Button
            variant="secondary"
            onPress={() => void data.options.refetch()}
          >
            重新加载
          </Button>
        </div>
      )}
      <div className="members-layout">
        <MemberList
          selectedId={selected}
          identityId={identity.id}
          canMoveMembers={data.canMoveMembers}
          departmentMode={departmentMode}
          canAddToDepartment={departmentId !== undefined}
          departmentName={departmentName}
          options={data.options.data}
          revision={data.revision}
          list={{
            data: data.list.data ?? {
              items: [],
              page: query.page,
              pageSize: query.pageSize,
              total: 0,
            },
            status: {
              loading: data.list.isPending,
              error: data.list.isError,
              onRetry: () => void data.list.refetch(),
            },
          }}
          query={query}
          onQueryChange={setQuery}
          onSelect={(id) => {
            setDetailTab("information");
            setSelected(id);
          }}
          renderVisible={(row) =>
            renderVisible(row, () => {
              setDetailTab("scopes");
              setSelected(row.id);
            })
          }
          onCreate={() => setCreating(true)}
          onStatus={setStatus}
          onBatch={setBatch}
          onAdd={() => setAdding(true)}
        />
        {selected && (
          <MemberDetailPanel
            key={selected}
            data={data}
            drawer={departmentMode}
            tab={detailTab}
            onTabChange={setDetailTab}
            renderScopes={renderScopes}
            onClose={() => setSelected(undefined)}
          />
        )}
      </div>
      {creating && data.options.data && (
        <CreateMemberDialog
          identity={identity}
          options={data.options.data}
          onCreate={data.create}
          onClose={() => setCreating(false)}
          onCreated={setCreated}
        />
      )}
      {created && (
        <MemberCreatedDialog
          result={created}
          onClose={() => setCreated(null)}
        />
      )}
      {status && (
        <MemberStatusDialog
          key={`${status.id}:${status.version}`}
          row={status}
          onClose={() => setStatus(null)}
          onSave={(signal) => data.status(status, signal)}
          onReload={async () => setStatus(await data.reload(status.id))}
        />
      )}
      {batch && data.options.data && (
        <BatchMembersDialog
          draft={batch}
          options={data.options.data}
          onSave={data.batch}
          onClose={() => setBatch(null)}
        />
      )}
      {adding && (
        <AddDepartmentMembers
          identityId={identity.id}
          departmentId={
            departmentId && departmentId !== "unassigned" ? departmentId : null
          }
          onClose={() => setAdding(false)}
          onSelect={(rows) => {
            setAdding(false);
            if (rows.length)
              setBatch({
                kind: "department",
                rows,
                departmentId:
                  departmentId && departmentId !== "unassigned"
                    ? departmentId
                    : null,
              });
          }}
        />
      )}
    </section>
  );
}
