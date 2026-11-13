import {
  type CreateDepartment,
  createDepartmentSchema,
  type Department,
  type DepartmentNode,
  type UpdateDepartment,
  updateDepartmentSchema,
} from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { departmentPath } from "../../department-state";
import { DepartmentParentPicker } from "../department-parent-picker/DepartmentParentPicker";
import "./DepartmentDialog.css";

export type DepartmentDraft =
  | { kind: "create"; parentId: string | null }
  | { kind: "edit"; department: Department };
export function DepartmentDialog({
  draft,
  items,
  orgName,
  onClose,
  onCreate,
  onUpdate,
  onReload,
}: {
  draft: DepartmentDraft;
  items: DepartmentNode[];
  orgName: string;
  onClose: () => void;
  onCreate: (
    values: CreateDepartment,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onUpdate: (
    row: Department,
    values: UpdateDepartment,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: (id: string) => Promise<Department>;
}) {
  const editing = draft.kind === "edit";
  const row = editing ? draft.department : undefined;
  const initial = {
    name: row?.name ?? "",
    parentId: editing ? (row?.parentId ?? null) : draft.parentId,
  };
  return (
    <FormDialog<CreateDepartment | UpdateDepartment>
      title={editing ? "编辑部门" : "新建部门"}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      schema={editing ? updateDepartmentSchema : createDepartmentSchema}
      scopeKey={
        editing ? `edit:${row?.id}` : `create:${initial.parentId ?? "root"}`
      }
      initialValues={initial}
      {...(row ? { version: row.version } : {})}
      columns={2}
      fields={[
        {
          name: "name",
          label: "部门名称",
          required: true,
          placeholder: "请输入部门名称",
        },
        {
          name: "parentId",
          label: "上级部门",
          required: false,
          type: "custom",
          render: ({ value, disabled, invalid, errorId, onChange }) => (
            <DepartmentParentPicker
              items={items}
              orgName={orgName}
              value={typeof value === "string" ? value : null}
              exclude={row?.id}
              disabled={disabled}
              invalid={invalid}
              errorId={errorId}
              onChange={onChange}
            />
          ),
        },
      ]}
      submitLabel="保存"
      rule={
        editing
          ? "调整上级会改变部门位置，并影响该部门成员的数据范围。预置部门不能删除；有成员或下级部门时也不能删除。"
          : "新部门建在所选上级的下一层。负责范围可在后续的负责范围功能中配置。"
      }
      {...(row
        ? {
            onReload: async () => {
              const current = await onReload(row.id);
              return {
                values: { name: current.name, parentId: current.parentId },
                version: current.version,
              };
            },
          }
        : {})}
      onSubmit={async (values, context) => {
        if (row)
          await onUpdate(row, updateDepartmentSchema.parse(values), context);
        else await onCreate(createDepartmentSchema.parse(values), context);
      }}
    >
      {({ values }) => (
        <div className="department-position" role="status">
          位置：
          {departmentPath(
            items,
            typeof values.parentId === "string" ? values.parentId : null,
            orgName,
          )}{" "}
          /{" "}
          {typeof values.name === "string" && values.name.trim()
            ? values.name.trim()
            : "新部门名称"}
        </div>
      )}
    </FormDialog>
  );
}
