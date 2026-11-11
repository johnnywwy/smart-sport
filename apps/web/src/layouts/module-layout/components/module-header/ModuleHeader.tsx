import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { Sidebar } from "@heroui-pro/react/sidebar";
import type { IdentitySummary } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { useSignOut } from "../../../../pages/login/hooks/use-sign-out";
import { IdentitySwitcher } from "../identity-switcher/IdentitySwitcher";
import "./ModuleHeader.css";
export function ModuleHeader({
  moduleName,
  pageName,
  identity,
}: {
  moduleName: string;
  pageName: string;
  identity: IdentitySummary;
}) {
  const navigate = useNavigate();
  const { pending, signOut } = useSignOut();
  return (
    <header className="module-header">
      <div className="module-breadcrumb">
        <Sidebar.Trigger aria-label="展开或收起侧栏" />
        <span>{moduleName}</span>
        <span aria-hidden="true">/</span>
        <strong>{pageName}</strong>
      </div>
      <div className="module-header-actions">
        <IdentitySwitcher identity={identity} />
        <Dropdown>
          <Button
            isIconOnly
            variant="tertiary"
            aria-label="用户菜单"
            className="module-user-button"
          >
            <Avatar size="sm">
              <Avatar.Fallback>管</Avatar.Fallback>
            </Avatar>
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="用户操作">
              <Dropdown.Item
                id="password"
                onAction={() => navigate("/change-password")}
                textValue="修改密码"
              >
                <Label>修改密码</Label>
              </Dropdown.Item>
              <Dropdown.Item
                id="logout"
                isDisabled={pending}
                onAction={() => void signOut()}
                textValue="退出登录"
              >
                <Label>退出登录</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </header>
  );
}
