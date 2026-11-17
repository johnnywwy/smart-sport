import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAcademic } from "../stores/academic";
import { academicYearsOptions } from "./academic-queries";
import {
  academicQueryPeriod,
  resolveAcademicPeriod,
} from "./academic-selection";

export function useAcademicSelection(identityId: string) {
  const query = useQuery({
    ...academicYearsOptions(identityId),
    staleTime: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const scope = useAcademic((state) => state.identityId);
  const stored = useAcademic((state) => state.choice);
  const choice = scope === identityId ? stored : null;
  const years = query.isError ? [] : (query.data ?? []);
  const resolved = resolveAcademicPeriod(years, choice);
  useEffect(() => {
    if (query.isSuccess && resolved.invalidChoice && choice)
      useAcademic.getState().discard(identityId, choice.semesterId);
  }, [query.isSuccess, resolved.invalidChoice, identityId, choice]);
  return {
    years,
    selection: resolved.selection,
    queryPeriod: academicQueryPeriod(resolved.selection),
    status: {
      loading: query.isPending,
      error: query.isError,
      retry: () => void query.refetch(),
    },
    onSelect: (semesterId: string) => {
      const academicYear = years.find((year) =>
        year.semesters.some((s) => s.id === semesterId),
      );
      if (!academicYear) return;
      useAcademic
        .getState()
        .select(
          identityId,
          semesterId === resolved.current?.semester.id
            ? null
            : { academicYearId: academicYear.id, semesterId },
        );
    },
  };
}
