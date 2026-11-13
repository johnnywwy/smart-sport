import { Button, Chip } from "@heroui/react";
import {
  dataScopeSchema,
  type ResetRole,
  type RoleDetail,
  type SaveRoleGrants,
} from "@smart-sport/contracts";
import { useState } from "react";
import { EditorDraftState } from "../../../../../shared/components/role-permissions/editor-draft-state/EditorDraftState";
import { GrantTree } from "../../../../../shared/components/role-permissions/grant-tree/GrantTree";
import { ScopeOptions } from "../../../../../shared/components/role-permissions/scope-options/ScopeOptions";
import { SchemaForm } from "../../../../../shared/components/schema-form/SchemaForm";
import type {
  FormSnapshot,
  FormSubmissionContext,
} from "../../../../../shared/components/schema-form/types";
import { useRoleReset } from "../../hooks/use-role-reset";
import {
  type ActorScopes,
  boundedRoleSchema,
  canGrant,
  grantsFit,
  permissionRole,
  roleChanges,
  roleValues,
} from "../../role-state";
import { OrganizationRolePreview } from "../organization-role-preview/OrganizationRolePreview";
import "./OrganizationRoleEditor.css";

export function OrganizationRoleEditor({
  role,
  scopes,
  actorReady,
  ownRole,
  onBusy,
  onDirty,
  onSave,
  onReset,
  onReload,
}: {
  role: RoleDetail;
  scopes: ActorScopes;
  actorReady: boolean;
  ownRole: boolean;
  onBusy: (value: boolean) => void;
  onDirty: (value: boolean) => void;
  onSave: (
    values: SaveRoleGrants,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReset: (values: ResetRole, context: FormSubmissionContext) => Promise<void>;
  onReload: () => Promise<FormSnapshot<SaveRoleGrants>>;
}) {
  const [revision, setRevision] = useState(0);
  const reset = useRoleReset({
    version: role.version,
    onReset,
    onReload,
    onBusy,
  });
  const editable =
    actorReady &&
    role.kind === "custom" &&
    !ownRole &&
    role.allowedActions.includes("update");
  return (
    <div className="organization-role-editor" data-readonly={!editable}>
      <SchemaForm
        scopeKey={`${role.id}:${revision}`}
        schema={boundedRoleSchema(scopes)}
        fields={[]}
        initialValues={roleValues(role)}
        version={role.version}
        submitLabel="保存"
        disabled={!editable || reset.pending}
        onPendingChange={onBusy}
        onSubmit={async (values, context) => {
          if (roleChanges(role, values)) await onSave(values, context);
        }}
        onReload={onReload}
      >
        {({ values: raw, disabled, setValue }) => {
          const values = raw as SaveRoleGrants;
          const changes = roleChanges(role, values);
          const disabledScopes = dataScopeSchema.options.filter(
            (dataScope) => !grantsFit(scopes, { ...values, dataScope }),
          );
          return (
            <>
              <EditorDraftState dirty={changes > 0} onDirty={onDirty} />
              <div className="organization-role-editor-grid">
                <div className="organization-role-fields">
                  <header className="organization-role-editor-heading">
                    <div>
                      <h2>{role.name}</h2>
                      <Chip size="sm">
                        {role.kind === "preset" ? "内置" : "自定义"}
                      </Chip>
                    </div>
                    <p>
                      {role.baseRoleName
                        ? `基于“${role.baseRoleName}”`
                        : "平台统一维护的内置角色"}
                    </p>
                    <div className="organization-role-editor-controls">
                      {!!changes && (
                        <span role="status">{changes} 处改动未保存</span>
                      )}
                      {!!changes && (
                        <Button
                          variant="secondary"
                          size="sm"
                          isDisabled={disabled}
                          onPress={() => setRevision(revision + 1)}
                        >
                          撤销改动
                        </Button>
                      )}
                      {editable &&
                        role.modified &&
                        role.allowedActions.includes("reset") && (
                          <Button
                            variant="secondary"
                            size="sm"
                            isDisabled={disabled || !!changes}
                            onPress={() => void reset.reset()}
                          >
                            恢复默认
                          </Button>
                        )}
                    </div>
                  </header>
                  {!editable && (
                    <p className="organization-role-readonly">
                      {role.kind === "preset"
                        ? "内置角色由平台统一维护。可基于它新建自定义角色，再调整权限。"
                        : ownRole
                          ? "不能修改当前身份正在使用的角色。"
                          : actorReady
                            ? "当前身份没有修改此角色的权限。"
                            : "正在确认当前身份的权限，暂时无法编辑。"}
                    </p>
                  )}
                  <section className="organization-role-scope">
                    <h2>第 2 步 · 能看到哪些数据</h2>
                    <ScopeOptions
                      value={values.dataScope}
                      type={role.identityType}
                      disabled={disabled}
                      disabledValues={disabledScopes}
                      onChange={(value) => setValue("dataScope", value)}
                    />
                  </section>
                  <GrantTree
                    role={permissionRole(role)}
                    values={values}
                    disabled={disabled}
                    canReset={false}
                    showPresets={false}
                    canGrant={(app, feature, action) =>
                      canGrant(scopes, values.dataScope, app, feature, action)
                    }
                    onChange={(grants) => setValue("grants", grants)}
                    onReset={() => {}}
                  />
                </div>
                <OrganizationRolePreview role={role} values={values} />
              </div>
            </>
          );
        }}
      </SchemaForm>
      {reset.error && (
        <div className="organization-role-reset-error" role="alert">
          <p>{reset.error}</p>
          <Button
            variant="secondary"
            isDisabled={reset.pending}
            onPress={() => void reset.reload()}
          >
            重新加载角色
          </Button>
        </div>
      )}
    </div>
  );
}
