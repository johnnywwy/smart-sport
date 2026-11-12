import { AlertDialog, Button, Spinner } from "@heroui/react";
import type { IdentityType } from "@smart-sport/contracts";
import { useState } from "react";
import { useBeforeUnload } from "react-router";
import { RoleEditor } from "../components/role-editor/RoleEditor";
import { RoleSelector } from "../components/role-selector/RoleSelector";
import { TemplateConfirmation } from "../components/template-confirmation/TemplateConfirmation";
import { usePresetRoles } from "../hooks/use-preset-roles";
import "./PresetRolesPage.css";

export function PresetRolesPage({ identityId }: { identityId: string }) {
  const data = usePresetRoles(identityId);
  const [type, setType] = useState<IdentityType>("company");
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [next, setNext] = useState<{ type: IdentityType; id?: string } | null>(
    null,
  );
  useBeforeUnload((event) => {
    if (dirty) event.preventDefault();
  });
  const roles = data.query.data ?? [];
  const role =
    roles.find(
      (item) => item.id === selectedId && item.identityType === type,
    ) ?? roles.find((item) => item.identityType === type);
  const select = (target: { type: IdentityType; id?: string }) => {
    if (busy) return;
    if (dirty) setNext(target);
    else {
      setType(target.type);
      setSelectedId(target.id);
    }
  };
  return (
    <main className="preset-roles-page">
      <header className="preset-roles-heading">
        <h1>角色模板</h1>
        <p>
          在这里设置每种角色的默认权限，所有组织自动沿用。只需要回答两个问题：能看到哪些数据，能做什么。
        </p>
      </header>
      {data.query.isPending ? (
        <div className="preset-roles-state" role="status">
          <Spinner size="sm" />
          正在加载角色模板…
        </div>
      ) : data.query.isError ? (
        <div className="preset-roles-state" role="alert">
          <p>角色模板加载失败，请稍后重试。</p>
          <Button variant="secondary" onPress={() => void data.query.refetch()}>
            重新加载
          </Button>
        </div>
      ) : !roles.length ? (
        <p className="preset-roles-state" role="status">
          暂无可用角色模板。
        </p>
      ) : (
        <div className="preset-roles-workspace">
          <RoleSelector
            roles={roles}
            selected={role?.id}
            type={type}
            disabled={busy}
            onType={(value) => {
              if (value !== type) select({ type: value });
            }}
            onSelect={(value) => {
              if (value.id !== role?.id)
                select({ type: value.identityType, id: value.id });
            }}
          />
          {role && (
            <RoleEditor
              key={`${identityId}:${role.id}:${role.version}`}
              role={role}
              onBusy={setBusy}
              onDirty={setDirty}
              onSave={(values, context) => data.save(role, values, context)}
              onReset={(input, context, name) =>
                data.reset(role, input, context, name)
              }
              onReload={() => data.reload(role.id)}
            />
          )}
        </div>
      )}
      <TemplateConfirmation
        value={data.confirmation}
        onConfirm={data.confirm}
      />
      <AlertDialog
        isOpen={Boolean(next)}
        onOpenChange={(open) => {
          if (!open) setNext(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>放弃未保存的改动？</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                切换角色后，当前未保存的设置会丢失。
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="secondary" onPress={() => setNext(null)}>
                  继续编辑
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    if (next) {
                      setType(next.type);
                      setSelectedId(next.id);
                    }
                    setDirty(false);
                    setNext(null);
                  }}
                >
                  放弃改动并切换
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </main>
  );
}
