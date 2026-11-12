import { Button, Chip } from "@heroui/react";
import {
  type ResetPresetRole,
  type SavePresetRole,
  savePresetRoleSchema,
} from "@smart-sport/contracts";
import { useEffect, useRef, useState } from "react";
import { SchemaForm } from "../../../../../shared/components/schema-form/SchemaForm";
import type {
  FormSnapshot,
  FormSubmissionContext,
} from "../../../../../shared/components/schema-form/types";
import {
  changedCount,
  identityLabels,
  type PresetRole,
  templateValues,
} from "../../template-state";
import { EditorDraftState } from "../editor-draft-state/EditorDraftState";
import { GrantTree } from "../grant-tree/GrantTree";
import { RolePreview } from "../role-preview/RolePreview";
import { ScopeOptions } from "../scope-options/ScopeOptions";
import "./RoleEditor.css";

export function RoleEditor({
  role,
  onSave,
  onReset,
  onReload,
  onBusy,
  onDirty,
}: {
  role: PresetRole;
  onSave: (
    values: SavePresetRole,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReset: (
    input: ResetPresetRole,
    context: FormSubmissionContext,
    name?: string,
  ) => Promise<void>;
  onReload: () => Promise<FormSnapshot<SavePresetRole>>;
  onBusy: (pending: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetAttempt, setResetAttempt] = useState<{
    input: string;
    key: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => onBusy(false), [onBusy]);
  const editable = role.editable && role.allowedActions.includes("update");
  const reset = async (
    feature?: { app: string; feature: string },
    name?: string,
  ) => {
    if (resetting) return;
    setResetting(true);
    controller.current = new AbortController();
    setResetError("");
    onBusy(true);
    const input = { version: role.version, ...(feature ? { feature } : {}) };
    const fingerprint = JSON.stringify(input);
    const key =
      resetAttempt?.input === fingerprint
        ? resetAttempt.key
        : crypto.randomUUID();
    setResetAttempt({ input: fingerprint, key });
    try {
      await onReset(
        input,
        { idempotencyKey: key, signal: controller.current.signal },
        name,
      );
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : "恢复失败，请重新加载后重试。",
      );
    } finally {
      setResetting(false);
      onBusy(false);
    }
  };
  return (
    <div className="template-editor" data-readonly={!editable}>
      <SchemaForm
        scopeKey={`${role.id}:${revision}`}
        schema={savePresetRoleSchema}
        fields={[
          {
            name: "remark",
            label: "角色说明",
            type: "textarea",
            required: false,
            placeholder: "填写角色说明（最多 500 字）",
          },
        ]}
        initialValues={templateValues(role)}
        version={role.version}
        submitLabel="保存"
        disabled={!editable || resetting}
        onSubmit={onSave}
        onReload={onReload}
        onPendingChange={onBusy}
      >
        {({ values: raw, disabled, setValue }) => {
          // 初始值来自已解析的响应，所有编辑仅更新同一契约内的字段。
          const values = raw as SavePresetRole;
          const changes = changedCount(role, values);
          const canReset =
            editable && role.allowedActions.includes("reset") && !changes;
          return (
            <>
              <EditorDraftState dirty={changes > 0} onDirty={onDirty} />
              <div className="template-editor-grid">
                <div className="template-editor-fields">
                  <header className="template-editor-header">
                    <div>
                      <h2>{role.name}</h2>
                      <Chip size="sm">{identityLabels[role.identityType]}</Chip>
                    </div>
                    <div>
                      <span role="status">
                        {changes
                          ? `有 ${changes} 处改动未保存`
                          : "当前设置已保存"}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        isDisabled={disabled || !changes}
                        onPress={() => setRevision(revision + 1)}
                      >
                        撤销改动
                      </Button>
                      {editable &&
                        role.allowedActions.includes("reset") &&
                        role.modified && (
                          <Button
                            variant="ghost"
                            size="sm"
                            isDisabled={disabled || !canReset}
                            onPress={() => void reset()}
                          >
                            恢复全部默认
                          </Button>
                        )}
                    </div>
                  </header>
                  {!editable && (
                    <p className="template-readonly">
                      此模板只读。超级管理员模板固定为全部管理；其他模板需要修改权限才可编辑。
                    </p>
                  )}

                  <section className="template-scope-section">
                    <h2>第 2 步 · 能看到哪些数据</h2>
                    <ScopeOptions
                      value={values.dataScope}
                      type={role.identityType}
                      disabled={disabled}
                      onChange={(value) => setValue("dataScope", value)}
                    />
                  </section>
                  <GrantTree
                    role={role}
                    values={values}
                    disabled={disabled}
                    canReset={canReset}
                    onChange={(grants) => setValue("grants", grants)}
                    onReset={(feature, name) => void reset(feature, name)}
                  />
                </div>
                <RolePreview role={role} values={values} />
              </div>
            </>
          );
        }}
      </SchemaForm>
      {resetError && (
        <p role="alert" className="template-reset-error">
          {resetError} 请重新加载最新模板后重试。
        </p>
      )}
      {resetError && (
        <Button
          variant="secondary"
          onPress={async () => {
            await onReload();
            setResetError("");
            setRevision(revision + 1);
          }}
        >
          重新加载模板
        </Button>
      )}
    </div>
  );
}
