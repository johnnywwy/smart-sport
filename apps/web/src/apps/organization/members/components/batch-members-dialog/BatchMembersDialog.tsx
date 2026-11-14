import { Button, Modal } from "@heroui/react";
import {
  type Member,
  type MemberOptions,
  type UpdateMember,
  updateMemberSchema,
} from "@smart-sport/contracts";
import { useEffect, useRef, useState } from "react";
import { SchemaForm } from "../../../../../shared/components/schema-form/SchemaForm";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import type { MembersData } from "../../hooks/use-members";
import type { BatchFailure } from "../../member-state";
import { MemberDepartmentPicker } from "../member-department-picker/MemberDepartmentPicker";
import { MemberRolePicker } from "../member-role-picker/MemberRolePicker";
import "./BatchMembersDialog.css";
export type MemberBatchDraft = {
  kind: "department" | "roles";
  rows: readonly Member[];
  departmentId?: string | null;
};
export function BatchMembersDialog({
  draft,
  options,
  onSave,
  onClose,
}: {
  draft: MemberBatchDraft;
  options: MemberOptions;
  onSave: MembersData["batch"];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const active = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    succeeded: number;
    failures: BatchFailure[];
  } | null>(null);
  const patch = useRef<Pick<UpdateMember, "departmentId" | "roleIds">>({});
  useEffect(() => () => active.current?.abort(), []);
  const types = new Set(draft.rows.map((row) => row.identityType));
  const roles = options.roles.filter(
    (role) => types.size === 1 && types.has(role.identityType),
  );
  const submit = async (
    rows: readonly Member[],
    context: FormSubmissionContext,
  ) => {
    const next = await onSave(rows, patch.current, context);
    setResult((previous) => ({
      succeeded: (previous?.succeeded ?? 0) + next.succeeded.length,
      failures: next.failures,
    }));
    locked.current = false;
    setBusy(false);
  };
  const close = () => {
    if (!locked.current) onClose();
  };
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <Modal.Container>
          <Modal.Dialog className="batch-members-dialog">
            <Modal.Header className="batch-members-header">
              <Modal.Heading>
                {draft.kind === "department" ? "批量移部门" : "批量设置角色"}
              </Modal.Heading>
              <Button
                variant="secondary"
                isIconOnly
                aria-label="关闭批量操作"
                isDisabled={busy}
                onPress={close}
              >
                ×
              </Button>
            </Modal.Header>
            <Modal.Body>
              <p>
                已选择 {draft.rows.length} 位成员。
                {draft.kind === "roles"
                  ? "将替换所选成员的本组织角色。"
                  : "将调整所选成员的所属部门。"}
              </p>
              {result ? (
                <div className="batch-members-result" role="status">
                  <strong>
                    成功 {result.succeeded} 人，失败 {result.failures.length} 人
                  </strong>
                  {result.failures.map(({ row, message, conflict }) => (
                    <div key={row.id}>
                      <strong>{row.realName}</strong>
                      <span>{message}</span>
                      {conflict && (
                        <small>请关闭后重新查看该成员，再决定是否修改。</small>
                      )}
                    </div>
                  ))}
                  <div className="batch-members-actions">
                    <Button
                      variant="secondary"
                      isDisabled={busy}
                      onPress={close}
                    >
                      完成
                    </Button>
                    {result.failures.some((f) => !f.conflict) && (
                      <Button
                        isDisabled={busy}
                        onPress={() => {
                          if (locked.current) return;
                          locked.current = true;
                          setBusy(true);
                          const controller = new AbortController();
                          active.current = controller;
                          void submit(
                            result.failures
                              .filter((f) => !f.conflict)
                              .map((f) => f.row),
                            {
                              signal: controller.signal,
                              idempotencyKey: crypto.randomUUID(),
                            },
                          ).finally(() => {
                            locked.current = false;
                            setBusy(false);
                          });
                        }}
                      >
                        仅重试失败项
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <SchemaForm
                  schema={updateMemberSchema}
                  version={0}
                  initialValues={
                    draft.kind === "department"
                      ? { departmentId: draft.departmentId ?? null }
                      : { roleIds: [] }
                  }
                  fields={[
                    draft.kind === "department"
                      ? {
                          name: "departmentId",
                          label: "目标部门",
                          required: false,
                          type: "custom",
                          render: ({ value, disabled, onChange }) => (
                            <MemberDepartmentPicker
                              items={options.departments}
                              value={typeof value === "string" ? value : null}
                              disabled={disabled}
                              onChange={onChange}
                            />
                          ),
                        }
                      : {
                          name: "roleIds",
                          label: "新的角色（替换现有角色）",
                          required: false,
                          type: "custom",
                          render: ({ value, disabled, onChange }) => (
                            <MemberRolePicker
                              roles={roles}
                              selected={Array.isArray(value) ? value : []}
                              disabled={disabled}
                              onChange={onChange}
                            />
                          ),
                        },
                  ]}
                  submitLabel="确认批量修改"
                  onCancel={close}
                  onPendingChange={(value) => {
                    locked.current = value;
                    setBusy(value);
                  }}
                  disabled={draft.kind === "roles" && types.size !== 1}
                  rule={
                    draft.kind === "roles" && types.size !== 1
                      ? "不同身份类型的成员请分别设置角色。"
                      : "每位成员单独校验权限和版本，失败项不会覆盖已有数据。"
                  }
                  onSubmit={async (value, context) => {
                    patch.current =
                      draft.kind === "department"
                        ? { departmentId: value.departmentId ?? null }
                        : { roleIds: value.roleIds ?? [] };
                    await submit(draft.rows, context);
                  }}
                />
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
