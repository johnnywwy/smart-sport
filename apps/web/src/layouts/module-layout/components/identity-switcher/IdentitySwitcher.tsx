import { Button, Dropdown, Label } from "@heroui/react";
import type { IdentitySummary } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { IdentityBadge } from "../../../../shared/components/identity-badge/IdentityBadge";
import {
  useIdentities,
  useSelectIdentity,
} from "../../../../shared/hooks/use-identities";
import "./IdentitySwitcher.css";
export function IdentitySwitcher({ identity }: { identity: IdentitySummary }) {
  const identities = useIdentities();
  const select = useSelectIdentity();
  const navigate = useNavigate();
  return (
    <Dropdown>
      <Button
        variant="tertiary"
        className={`module-identity module-identity-${identity.type}`}
        aria-label="切换组织"
        isDisabled={select.isPending}
      >
        <IdentityBadge identity={identity} />
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label="组织身份">
          {(identities.data?.groups.flatMap((group) => group.items) ?? []).map(
            (item) => (
              <Dropdown.Item
                key={item.id}
                id={item.id}
                isDisabled={!item.available || select.isPending}
                onAction={() => select.mutate(item.id)}
                textValue={`${item.orgName} ${item.typeName}`}
              >
                <Label>
                  {item.orgName} · {item.title ?? item.typeName}
                </Label>
              </Dropdown.Item>
            ),
          )}
          <Dropdown.Item
            id="all"
            onAction={() => navigate("/select-org")}
            textValue="查看全部组织"
          >
            <Label>查看全部组织</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
