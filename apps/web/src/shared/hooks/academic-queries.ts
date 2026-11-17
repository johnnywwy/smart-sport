import { academicYearListSchema } from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../api/client";

/** 顶栏与管理页共享同一份身份隔离的日历，写入后能立即同步。 */
export const academicYearsOptions = (identityId: string) =>
  queryOptions({
    queryKey: [identityId, "academic-years"],
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/academic-years", academicYearListSchema, {
        signal,
        notify: false,
      }),
  });
