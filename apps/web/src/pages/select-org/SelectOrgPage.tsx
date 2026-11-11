import { useMemo, useState } from "react";
import { Navigate } from "react-router";
import {
  useIdentities,
  useSelectIdentity,
} from "../../shared/hooks/use-identities";
import { useSession } from "../../shared/stores/session";
import { useSignOut } from "../login/hooks/use-sign-out";
import { IdentityGroup } from "./components/identity-group/IdentityGroup";
import { IdentityListState } from "./components/identity-list-state/IdentityListState";
import { SelectOrgHeader } from "./components/select-org-header/SelectOrgHeader";
import { SelectOrgToolbar } from "./components/select-org-toolbar/SelectOrgToolbar";
import { filterIdentityGroups } from "./hooks/identity-filter";

export function SelectOrgPage() {
  const token = useSession((state) => state.accessToken);
  const mustChangePassword = useSession((state) => state.mustChangePassword);
  const [query, setQuery] = useState("");
  const identities = useIdentities();
  const selectIdentity = useSelectIdentity();
  const { pending: signingOut, signOut } = useSignOut();
  const groups = useMemo(
    () => filterIdentityGroups(identities.data?.groups ?? [], query),
    [identities.data?.groups, query],
  );
  if (!token) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  const pendingIdentityId = selectIdentity.isPending
    ? selectIdentity.variables
    : null;
  return (
    <div className="select-org-page">
      <SelectOrgHeader pending={signingOut} onSignOut={() => void signOut()} />
      <main className="select-org-main">
        <SelectOrgToolbar
          count={identities.data?.total ?? 0}
          query={query}
          onQueryChange={setQuery}
        />
        <div className="mt-8 space-y-8">
          {identities.isPending && <IdentityListState state="loading" />}
          {identities.isError && (
            <IdentityListState
              state="error"
              onRetry={() => void identities.refetch()}
            />
          )}
          {identities.data?.total === 0 && <IdentityListState state="empty" />}
          {identities.data && identities.data.total > 0 && !groups.length && (
            <IdentityListState state="no-results" />
          )}
          {groups.map((group) => (
            <IdentityGroup
              key={group.type}
              group={group}
              pendingIdentityId={pendingIdentityId}
              onSelect={(identityId) => selectIdentity.mutate(identityId)}
            />
          ))}
        </div>
        <p className="mt-10 text-center text-[13px] leading-5 text-[#63636b]">
          没有看到你的组织？请联系该组织的管理员为你添加身份。
        </p>
      </main>
    </div>
  );
}
