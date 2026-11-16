import type { IdentitySummary } from "@smart-sport/contracts";
import { useState } from "react";
import { initialSchoolQuery } from "../../../../shared/hooks/school-navigation";
import { useSchools } from "../../../../shared/hooks/use-schools";
import { SchoolList } from "../components/school-list/SchoolList";
import { useEnterSchool } from "../hooks/use-enter-school";

export function SchoolsPage({
  identity,
  classesPath,
}: {
  identity: IdentitySummary;
  classesPath: string | undefined;
}) {
  const [query, setQuery] = useState(initialSchoolQuery);
  const list = useSchools(identity.id, {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword,
    permission: "ops:school:view",
  });
  const enter = useEnterSchool(classesPath);
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
        onSelect: (school) => enter.mutate(school),
      }}
    />
  );
}
