import { Button, Drawer, Spinner, Tabs } from "@heroui/react";
import type { memberDetailSchema } from "@smart-sport/contracts";
import { type ReactNode, useState } from "react";
import type { MembersData } from "../../hooks/use-members";
import { MemberEditor } from "../member-editor/MemberEditor";
import "./MemberDetailPanel.css";
export function MemberDetailPanel({
  data,
  drawer,
  tab,
  onTabChange,
  renderScopes,
  onClose,
}: {
  data: MembersData;
  drawer: boolean;
  tab: string;
  onTabChange: (tab: string) => void;
  renderScopes: (row: ReturnType<typeof memberDetailSchema.parse>) => ReactNode;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const row = data.detail.data;
  const content =
    data.detail.isPending || data.options.isPending ? (
      <div role="status">
        <Spinner size="sm" />
        正在加载成员…
      </div>
    ) : data.detail.isError || data.options.isError ? (
      <div role="alert">
        <p>成员信息加载失败。</p>
        <Button
          variant="secondary"
          onPress={() => {
            void data.detail.refetch();
            void data.options.refetch();
          }}
        >
          重新加载
        </Button>
      </div>
    ) : row && data.options.data ? (
      <Tabs
        className="member-detail-tabs"
        selectedKey={tab}
        onSelectionChange={(key) => onTabChange(String(key))}
        isDisabled={busy}
      >
        <Tabs.List>
          <Tabs.Tab id="information">
            基本信息
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="scopes">
            负责范围
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel id="information" shouldForceMount>
          <MemberEditor
            row={row}
            options={data.options.data}
            onSave={async (value, context) => {
              await data.update(row, value, context);
            }}
            onReload={() => data.reload(row.id)}
            onClose={onClose}
            onPendingChange={setBusy}
          />
        </Tabs.Panel>
        <Tabs.Panel id="scopes" shouldForceMount>
          <div className="member-detail-content">
            <h2>负责范围 · {row.realName}</h2>
            {renderScopes(row)}
          </div>
        </Tabs.Panel>
      </Tabs>
    ) : null;
  const close = () => {
    if (!busy) onClose();
  };
  if (!drawer)
    return (
      <aside className="member-detail-panel" aria-label="分配角色">
        {content}
      </aside>
    );
  return (
    <Drawer
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Drawer.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="member-detail-drawer">
            <Drawer.Header className="member-drawer-header">
              <Drawer.Heading>人员信息</Drawer.Heading>
              <Button
                variant="secondary"
                isIconOnly
                aria-label="关闭人员信息"
                isDisabled={busy}
                onPress={close}
              >
                ×
              </Button>
            </Drawer.Header>
            <Drawer.Body>{content}</Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
