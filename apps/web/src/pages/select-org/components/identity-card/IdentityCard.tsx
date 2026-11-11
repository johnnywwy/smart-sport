import "./IdentityCard.css";
import { Button, Card, Chip } from "@heroui/react";
import type { IdentityList, IdentitySummary } from "@smart-sport/contracts";
import { IdentityIcon } from "../identity-icon/IdentityIcon";

type IdentityGroupType = IdentityList["groups"][number]["type"];

type IdentityCardProps = {
  groupType: IdentityGroupType;
  identity: IdentitySummary;
  pending: boolean;
  onSelect: (identityId: string) => void;
};

function identityDescription(identity: IdentitySummary) {
  return [identity.typeName, identity.departmentName, identity.title]
    .filter(Boolean)
    .join(" · ");
}

function CardContent({
  groupType,
  identity,
}: Pick<IdentityCardProps, "groupType" | "identity">) {
  return (
    <>
      <IdentityIcon type={groupType} />
      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold text-[#18181b]">
            {identity.orgName}
          </span>
          {identity.lastUsed && identity.available && (
            <Chip size="sm" variant="soft" color="accent">
              上次使用
            </Chip>
          )}
          {!identity.available && (
            <Chip size="sm" variant="soft">
              服务已停用
            </Chip>
          )}
        </span>
        <span className="mt-1 block text-[13px] leading-5 text-[#63636b]">
          {identityDescription(identity)}
        </span>
        {!identity.available && identity.unavailableReason && (
          <span className="mt-1 block text-[13px] leading-5 text-[#63636b]">
            {identity.unavailableReason}
          </span>
        )}
      </span>
      <svg
        aria-hidden="true"
        className="select-org-card-arrow"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </>
  );
}

export function IdentityCard({
  groupType,
  identity,
  pending,
  onSelect,
}: IdentityCardProps) {
  const className = "select-org-card";
  if (!identity.available)
    return (
      <Card className={`${className} is-unavailable`}>
        <Card.Content className="flex w-full items-center gap-4 p-0">
          <CardContent groupType={groupType} identity={identity} />
        </Card.Content>
      </Card>
    );
  return (
    <Button
      className={className}
      variant="ghost"
      isDisabled={pending}
      onPress={() => onSelect(identity.id)}
      aria-label={`进入${identity.orgName}`}
    >
      <CardContent groupType={groupType} identity={identity} />
    </Button>
  );
}
