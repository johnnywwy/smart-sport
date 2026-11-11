import type { IdentityList, IdentitySummary } from "@smart-sport/contracts";

type IdentityGroup = IdentityList["groups"][number];

function matchesIdentity(identity: IdentitySummary, normalizedQuery: string) {
  return [
    identity.orgName,
    identity.typeName,
    identity.departmentName,
    identity.title,
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
}

export function filterIdentityGroups(
  groups: readonly IdentityGroup[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((identity) =>
        matchesIdentity(identity, normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
