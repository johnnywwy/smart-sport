import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError } from "../errors/api-error";
import { useSchool } from "../stores/school";
import { menuSchoolOptions, type SchoolPermissions } from "./use-menu-schools";

export function useCurrentSchool(
  identityId: string,
  permissions: SchoolPermissions,
) {
  const current = useSchool((state) => state.current);
  const recent = useSchool((state) => state.recent);
  const result = useQuery({
    ...menuSchoolOptions(
      identityId,
      current ?? { id: "", name: "", regionName: "" },
      permissions,
    ),
    enabled: !!current,
  });
  const history = useQueries({
    queries: recent.map((school) =>
      menuSchoolOptions(identityId, school, permissions),
    ),
  });
  const invalid =
    !!current &&
    !result.isFetching &&
    ((result.isSuccess && result.data === null) ||
      (result.error instanceof ApiError && result.error.status === 403));
  useEffect(() => {
    if (invalid && current) useSchool.getState().discard(current.id);
  }, [invalid, current]);
  return {
    selected: !result.isFetching && result.isSuccess ? result.data : null,
    checking: !!current && (result.isPending || result.isFetching),
    error: !!current && result.isError,
    retry: () => void result.refetch(),
    recent: history.flatMap((item) =>
      item.isSuccess && !item.isFetching && item.data ? [item.data] : [],
    ),
    select: useSchool.getState().select,
  };
}
