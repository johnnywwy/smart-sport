import { Avatar } from "@heroui/react";
import type { IdentitySummary } from "@smart-sport/contracts";
import "./IdentityBadge.css";
export function IdentityBadge({ identity }: { identity: IdentitySummary }) {
  return (
    <span className={`identity-badge identity-badge-${identity.type}`}>
      <Avatar size="sm" className="identity-badge-avatar">
        <Avatar.Fallback>{identity.orgName.slice(0, 1)}</Avatar.Fallback>
      </Avatar>
      <span className="identity-badge-org">{identity.orgName}</span>
      <span className="identity-badge-title">
        {identity.title ?? identity.typeName}
      </span>
      <span className="identity-badge-chevron" aria-hidden="true">
        ⌄
      </span>
    </span>
  );
}
