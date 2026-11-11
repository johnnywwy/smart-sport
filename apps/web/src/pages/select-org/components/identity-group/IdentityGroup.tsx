import type { IdentityList } from "@smart-sport/contracts";
import { useId } from "react";
import { IdentityCard } from "../identity-card/IdentityCard";

type IdentityGroupData = IdentityList["groups"][number];

type IdentityGroupProps = {
  group: IdentityGroupData;
  pendingIdentityId: string | null;
  onSelect: (identityId: string) => void;
};

export function IdentityGroup({
  group,
  pendingIdentityId,
  onSelect,
}: IdentityGroupProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-sm font-semibold text-[#63636b]">
        {group.typeName}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {group.items.map((identity) => (
          <IdentityCard
            key={identity.id}
            groupType={group.type}
            identity={identity}
            pending={pendingIdentityId !== null}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
