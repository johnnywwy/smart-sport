import type { RegionManagementRow } from "@smart-sport/contracts";
import { useState } from "react";
import { TableListState } from "../../../../shared/components/data-table/components/table-list-state/TableListState";
import { ProvinceList } from "../components/province-list/ProvinceList";
import { RegionDetails } from "../components/region-details/RegionDetails";
import { RegionList } from "../components/region-list/RegionList";
import { RegionSyncDialog } from "../components/region-sync-dialog/RegionSyncDialog";
import { useRegions } from "../hooks/use-regions";
import { initialRegionQuery } from "../region-state";
import "./RegionsPage.css";
export function RegionsPage({ identityId }: { identityId: string }) {
  const [path, setPath] = useState<RegionManagementRow[]>([]),
    [query, setQuery] = useState(initialRegionQuery),
    [details, setDetails] = useState<RegionManagementRow | null>(null),
    [syncOpen, setSyncOpen] = useState(false);
  // 初次查询先加载省份，选择上级后只加载其直接下级。
  const data = useRegions(identityId, query, path.at(-1)?.code, syncOpen);
  const first = data.provinces.data?.items[0];
  if (!path.length && first) setPath([first]);
  const reset = (next: RegionManagementRow[]) => {
    setPath(next);
    setQuery({ ...initialRegionQuery, pageSize: query.pageSize });
    setDetails(null);
  };
  const total = data.items.data?.total ?? 0,
    lastPage = Math.max(1, Math.ceil(total / query.pageSize));
  if (data.items.data && !data.items.isFetching && query.page > lastPage)
    setQuery({ ...query, page: lastPage });
  return (
    <div className="regions-page">
      <RegionList
        identityId={identityId}
        permissions={
          !data.provinces.isError &&
          data.provinces.data?.allowedActions.includes("import")
            ? ["system:region:import"]
            : []
        }
        data={
          !data.items.isError && data.items.data
            ? data.items.data
            : {
                items: [],
                total: 0,
                page: query.page,
                pageSize: query.pageSize,
              }
        }
        query={query}
        onQueryChange={setQuery}
        trail={path}
        onNavigate={(index) => reset(path.slice(0, index + 1))}
        onView={(row) => {
          if (row.level < 3) reset([...path, row]);
          else setDetails(row);
        }}
        onSync={() => setSyncOpen(true)}
        status={{
          loading:
            data.provinces.isPending || (!!path.length && data.items.isPending),
          error: data.provinces.isError || data.items.isError,
          onRetry: () => {
            if (data.provinces.isError) void data.provinces.refetch();
            else void data.items.refetch();
          },
        }}
        sidebar={
          data.provinces.isPending || data.provinces.isError ? (
            <TableListState
              loading={data.provinces.isPending}
              error={data.provinces.isError}
              onRetry={() => void data.provinces.refetch()}
            />
          ) : (
            <ProvinceList
              items={data.provinces.data?.items ?? []}
              selected={path[0]?.code}
              onSelect={(row) => reset([row])}
            />
          )
        }
      />
      <p className="regions-note">
        学校数包含本级及下级的未删除学校；对应教育局按本级关联展示。同步使用已审核的数据版本，不自动调整组织归属。
      </p>
      {details && (
        <RegionDetails row={details} onClose={() => setDetails(null)} />
      )}
      {syncOpen && (
        <RegionSyncDialog
          identityId={identityId}
          preview={data.preview.data}
          loading={data.preview.isFetching}
          error={data.preview.isError}
          onRetry={() => void data.preview.refetch()}
          onReload={data.reloadPreview}
          onConfirm={async (fingerprint, context) => {
            await data.sync(fingerprint, context);
            reset([]);
          }}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </div>
  );
}
