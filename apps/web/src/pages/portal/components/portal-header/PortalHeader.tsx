import { BrandMark } from "../../../../shared/components/brand-mark/BrandMark";
import "./PortalHeader.css";
import { Avatar, Button } from "@heroui/react";
import type { IdentitySummary } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { useSignOut } from "../../../login/hooks/use-sign-out";
export function PortalHeader({ identity }: { identity: IdentitySummary }) {
  const navigate = useNavigate();
  const { pending, signOut } = useSignOut();
  return (
    <div className="portal-header">
      <div className="portal-brand">
        <BrandMark />
        <span>智慧体育云平台</span>
      </div>
      <div className="portal-header-actions">
        <Button
          className="portal-identity-switch"
          variant="secondary"
          onPress={() => navigate("/select-org")}
          aria-label={`切换组织，当前：${identity.orgName} ${identity.title ?? identity.typeName}`}
        >
          <Avatar className="portal-org-avatar" size="sm">
            <Avatar.Fallback>{identity.orgName.slice(0, 1)}</Avatar.Fallback>
          </Avatar>
          <span>{identity.orgName}</span>
          <span className="portal-identity-title">
            {identity.title ?? identity.typeName}
          </span>
          <span aria-hidden="true">⌄</span>
        </Button>
        <Button
          className="portal-logout"
          variant="tertiary"
          isDisabled={pending}
          onPress={() => void signOut()}
        >
          {pending ? "正在退出…" : "退出登录"}
        </Button>
        <Avatar className="portal-user-avatar" size="sm">
          <Avatar.Fallback>管</Avatar.Fallback>
        </Avatar>
      </div>
    </div>
  );
}
