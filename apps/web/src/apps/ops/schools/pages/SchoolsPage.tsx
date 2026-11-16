import type { IdentitySummary } from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { initialSchoolQuery } from "../../../../shared/hooks/school-navigation";
import type { SchoolChoice } from "../../../../shared/types/school";
import { SchoolList } from "../components/school-list/SchoolList";
import { useEnterSchool } from "../hooks/use-enter-school";
import { useSchoolManagement } from "../hooks/use-school-management";

export function SchoolsPage({
  identity,
  classesPath,
  renderProfile,
}: {
  identity: IdentitySummary;
  classesPath: string | undefined;
  renderProfile: (school: SchoolChoice, onBack: () => void) => ReactNode;
}) {
  const [query, setQuery] = useState(initialSchoolQuery);
  const [school, setSchool] = useState<SchoolChoice | null>(null);
  const list = useSchoolManagement(
    identity.id,
    identity.type === "company",
    query,
  );
  const enter = useEnterSchool(classesPath);
  if (school) return renderProfile(school, () => setSchool(null));
  return (
    <SchoolList
      identityId={identity.id}
      data={list.data}
      query={query}
      onQueryChange={setQuery}
      status={{
        loading: list.isPending || list.isFetching,
        error: list.isError,
        onRetry: () => void list.refetch(),
      }}
      enter={{
        enabled: identity.type === "company" && !!classesPath,
        busy: enter.isPending,
        allowedIds: list.data?.operationIds ?? new Set(),
        onSelect: (school) => enter.mutate(school),
      }}
      profile={{
        enabled: identity.type === "company",
        allowedIds: list.data?.profileIds ?? new Set(),
        onSelect: setSchool,
      }}
    />
  );
}
