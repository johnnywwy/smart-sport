import { Button, Modal, Spinner } from "@heroui/react";
import type { IdentitySummary } from "@smart-sport/contracts";
import { useState } from "react";
import { useBeforeUnload } from "react-router";
import { CreateRoleDialog } from "../components/create-role-dialog/CreateRoleDialog";
import { DiscardRoleChanges } from "../components/discard-role-changes/DiscardRoleChanges";
import { OrganizationRoleEditor } from "../components/organization-role-editor/OrganizationRoleEditor";
import { RoleConfirmation } from "../components/role-confirmation/RoleConfirmation";
import { RoleList } from "../components/role-list/RoleList";
import { useOrganizationRoles } from "../hooks/use-organization-roles";
import { useRoleBases } from "../hooks/use-role-bases";
import "../../../../shared/components/role-permissions/RolePermissions.css";
import "./OrganizationRolesPage.css";

type Next = { kind: "select"; id: string } | { kind: "create" };
export function OrganizationRolesPage({
  identity,
}: {
  identity: IdentitySummary;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [next, setNext] = useState<Next | null>(null);
  const data = useOrganizationRoles(identity, selectedId);
  const roles = data.list.data ?? [];
  const bases = useRoleBases(identity.id, roles, data.scopes, creating);
  const role = data.detail.data;
  useBeforeUnload((event) => {
    if (dirty) event.preventDefault();
  });
  const proceed = (target: Next) => {
    setRevision((value) => value + 1);
    setDirty(false);
    if (target.kind === "create") setCreating(true);
    else setSelectedId(target.id);
  };
  const select = (target: Next) => {
    if (busy) return;
    if (dirty) setNext(target);
    else proceed(target);
  };
  return (
    <main className="organization-roles-page role-permission-surface">
      <header className="organization-roles-heading">
        <h1>角色权限</h1>
        <p>
          设置本组织的角色：能看到哪些数据，能使用哪些菜单和按钮。新建角色后可分配给成员。
        </p>
      </header>
      {data.list.isPending ? (
        <div className="organization-roles-state" role="status">
          <Spinner size="sm" />
          正在加载角色…
        </div>
      ) : data.list.isError ? (
        <div className="organization-roles-state" role="alert">
          <p>角色加载失败，请稍后重试。</p>
          <Button variant="secondary" onPress={() => void data.list.refetch()}>
            重新加载
          </Button>
        </div>
      ) : !roles.length ? (
        <p className="organization-roles-state">暂无可用角色。</p>
      ) : (
        <div className="organization-roles-workspace">
          <RoleList
            roles={roles}
            selected={role?.id}
            disabled={busy || creating}
            permissions={[...data.scopes.keys()]}
            onCreate={() => select({ kind: "create" })}
            onSelect={(id) => {
              if (id !== role?.id) select({ kind: "select", id });
            }}
          />
          <div className="organization-roles-detail">
            {data.actorError && (
              <div role="alert" className="organization-roles-permission-error">
                <p>当前身份的权限加载失败，暂时无法编辑或新建。</p>
                <Button
                  variant="secondary"
                  onPress={() => void data.retryActor()}
                >
                  重试权限加载
                </Button>
              </div>
            )}
            {data.detail.isPending ? (
              <div className="organization-roles-state" role="status">
                <Spinner size="sm" />
                正在加载权限…
              </div>
            ) : data.detail.isError ? (
              <div role="alert" className="organization-roles-state">
                <p>角色详情加载失败。</p>
                <Button
                  variant="secondary"
                  onPress={() => void data.detail.refetch()}
                >
                  重新加载角色
                </Button>
              </div>
            ) : (
              role && (
                <OrganizationRoleEditor
                  key={`${identity.id}:${role.id}:${role.version}:${revision}`}
                  role={role}
                  scopes={data.scopes}
                  actorReady={data.actorReady}
                  ownRole={identity.roleIds.includes(role.id)}
                  onBusy={setBusy}
                  onDirty={setDirty}
                  onSave={(values, context) => data.save(role, values, context)}
                  onReset={(values, context) =>
                    data.reset(role, values, context)
                  }
                  onReload={data.reload}
                />
              )
            )}
          </div>
        </div>
      )}
      {creating && !bases.pending && !bases.error && bases.bases.length ? (
        <CreateRoleDialog
          open
          bases={bases.bases}
          selected={role?.baseRoleId ?? role?.id}
          onOpenChange={setCreating}
          onSubmit={async (values, context) => {
            const saved = await data.create(values, context);
            setSelectedId(saved.id);
          }}
        />
      ) : (
        <Modal isOpen={creating} onOpenChange={setCreating}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="organization-role-loading-dialog">
                <Modal.Header>
                  <Modal.Heading>新建角色</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  {bases.pending ? (
                    <div role="status">
                      <Spinner size="sm" />
                      正在加载可用的基础角色…
                    </div>
                  ) : bases.error ? (
                    <p role="alert">基础角色加载失败，请重试。</p>
                  ) : (
                    <p>
                      没有可授予的内置角色。基础角色的所有权限和数据范围都不能超过你自己拥有的。
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  {bases.error && (
                    <Button
                      variant="secondary"
                      onPress={() => void bases.retry()}
                    >
                      重试
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onPress={() => setCreating(false)}
                  >
                    取消
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
      <RoleConfirmation value={data.confirmation} onConfirm={data.confirm} />
      <DiscardRoleChanges
        open={!!next}
        onConfirm={(accepted) => {
          if (accepted && next) proceed(next);
          setNext(null);
        }}
      />
    </main>
  );
}
