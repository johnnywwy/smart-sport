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
      <svg
        className="identity-badge-chevron"
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
      </svg>
    </span>
  );
}
