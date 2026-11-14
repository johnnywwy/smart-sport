import { Button, Spinner } from "@heroui/react";
import type { Department, IdentitySummary } from "@smart-sport/contracts";
import { type ReactNode, useState } from "react";
import { DeleteDepartmentDialog } from "../components/delete-department-dialog/DeleteDepartmentDialog";
import { DepartmentDetail } from "../components/department-detail/DepartmentDetail";
import {
  DepartmentDialog,
  type DepartmentDraft,
} from "../components/department-dialog/DepartmentDialog";
import { DepartmentTree } from "../components/department-tree/DepartmentTree";
import {
  departmentPermissions,
  flattenDepartments,
  organizationRoot,
  unassignedDepartment,
} from "../department-state";
import { useDepartments } from "../hooks/use-departments";
import "./DepartmentsPage.css";
export function DepartmentsPage({
  identity,
  renderMembers,
}: {
  identity: IdentitySummary;
  renderMembers: (context: {
    departmentId?: string;
    departmentName: string;
  }) => ReactNode;
}) {
  const data = useDepartments(identity.id);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<DepartmentDraft | null>(null);
  const [deletion, setDeletion] = useState<Department | null>(null);
  const tree = data.tree.data;
  const rows = flattenDepartments(tree?.items ?? []);
  const selected =
    selectedId === unassignedDepartment ||
    selectedId === organizationRoot ||
    rows.some((row) => row.id === selectedId)
      ? selectedId
      : (rows[0]?.id ?? organizationRoot);
  const selectSaved = (row: Department) => {
    setSelectedId(row.id);
  };
  return (
    <main className="departments-page">
      <header className="departments-heading">
        <h1>组织架构</h1>
        <p>部门是树形的，可以一层层往下建。拖动部门可以换上级。</p>
      </header>
      {data.tree.isPending ? (
        <div className="departments-state" role="status">
          <Spinner size="sm" />
          正在加载部门…
        </div>
      ) : data.tree.isError ? (
        <div className="departments-state" role="alert">
          <p>部门加载失败，请稍后重试。</p>
          <Button variant="secondary" onPress={() => void data.tree.refetch()}>
            重新加载
          </Button>
        </div>
      ) : (
        tree && (
          <div className="departments-workspace">
            <DepartmentTree
              data={tree}
              orgName={identity.orgName}
              selected={selected ?? organizationRoot}
              busy={data.busy}
              permissions={departmentPermissions(tree)}
              onSelect={setSelectedId}
              onCreate={(parentId) => setDraft({ kind: "create", parentId })}
              onMove={(row, parentId) => {
                void data
                  .move(row, parentId)
                  .then(selectSaved)
                  .catch(() => {});
              }}
            />
            <DepartmentDetail
              selected={selected ?? organizationRoot}
              data={tree}
              orgName={identity.orgName}
              busy={data.busy}
              membersContent={renderMembers({
                ...(selected && selected !== organizationRoot
                  ? { departmentId: selected }
                  : {}),
                departmentName:
                  selected === unassignedDepartment
                    ? "未分配部门"
                    : (rows.find((row) => row.id === selected)?.name ??
                      identity.orgName),
              })}
              onEdit={(department) => setDraft({ kind: "edit", department })}
              onDelete={setDeletion}
            />
          </div>
        )
      )}
      {draft && tree && (
        <DepartmentDialog
          draft={draft}
          items={tree.items}
          orgName={identity.orgName}
          onClose={() => setDraft(null)}
          onCreate={async (values, context) => {
            selectSaved(await data.create(values, context));
          }}
          onUpdate={async (row, values, context) => {
            selectSaved(await data.update(row, values, context));
          }}
          onReload={data.reload}
        />
      )}
      {deletion && (
        <DeleteDepartmentDialog
          key={`${deletion.id}:${deletion.version}`}
          row={deletion}
          busy={data.busy}
          onClose={() => setDeletion(null)}
          onDelete={async () => {
            await data.remove(deletion);
            setDeletion(null);
            setSelectedId(deletion.parentId ?? organizationRoot);
          }}
          onReload={async () => {
            const current = await data.reload(deletion.id);
            if (!current.allowedActions.includes("delete")) setDeletion(null);
            else setDeletion(current);
          }}
        />
      )}
    </main>
  );
}
