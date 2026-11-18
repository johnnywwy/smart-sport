import type { RegionSyncPreview } from "@smart-sport/contracts";
import { useState } from "react";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import { initialRegionQuery } from "../../region-state";
import "./RegionSyncSummary.css";

const labels = {
  added: "新增",
  renamed: "改名",
  retired: "撤销",
  moved: "改隶",
} as const;
export function RegionSyncSummary({ preview }: { preview: RegionSyncPreview }) {
  const [query, setQuery] = useState(initialRegionQuery);
  const filtered = preview.changes.filter((c) =>
    (c.after?.name ?? c.before?.name ?? "").includes(query.keyword.trim()),
  );
  return (
    <section className="region-sync-summary">
      <p>
        审核版本：{preview.source.version} · 审核日期：
        {preview.source.reviewedAt}
      </p>
      <dl className="region-sync-counts">
        {Object.entries(labels).map(([kind, label]) => (
          <div key={kind}>
            <dt>{label}</dt>
            <dd>{preview.changes.filter((c) => c.kind === kind).length} 个</dd>
          </div>
        ))}
      </dl>
      {preview.changes.length > 0 && (
        <p>明细查询仅用于查看；确认将应用本次预览中的全部变更。</p>
      )}
      {preview.changes.length === 0 ? (
        <p>当前区划已与审核版本一致，无需同步。</p>
      ) : (
        <DataTable
          scopeKey={preview.fingerprint}
          config={{
            title: "变更明细",
            permissions: [],
            searchPlaceholder: "区划名称",
            rowLabel: (r) => r.after?.name ?? r.before?.name ?? "区划",
            columns: [
              { id: "kind", label: "变更", render: (r) => labels[r.kind] },
              {
                id: "before",
                label: "原名称",
                render: (r) => r.before?.name ?? "无",
              },
              {
                id: "after",
                label: "新名称",
                render: (r) => r.after?.name ?? "撤销（保留历史记录）",
              },
            ],
          }}
          query={query}
          onQueryChange={setQuery}
          data={{
            items: filtered
              .slice(
                (query.page - 1) * query.pageSize,
                query.page * query.pageSize,
              )
              .map((c) => ({ ...c, id: c.code, allowedActions: [] })),
            total: filtered.length,
            page: query.page,
            pageSize: query.pageSize,
          }}
        />
      )}
      {preview.blocked && (
        <div className="region-sync-blocked" role="alert">
          <strong>存在关联影响，暂不能同步</strong>
          <p>请先处理以下组织归属或负责范围，再重新预览。本次不会部分应用。</p>
          <ul>
            {[
              ...new Set(
                preview.impacts.map(
                  (impact) =>
                    `${impact.name} · ${impact.kind === "organization" ? "组织归属" : impact.kind === "department" ? "部门负责范围" : "本人额外负责"} · ${impact.regionName}`,
                ),
              ),
            ].map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
