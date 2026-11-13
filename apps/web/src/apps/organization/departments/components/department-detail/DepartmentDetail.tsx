import { Button, Chip, Tabs } from "@heroui/react";
import type { DepartmentNode, DepartmentTree } from "@smart-sport/contracts";
import { useState } from "react";
import {
  departmentPath,
  flattenDepartments,
  organizationRoot,
  unassignedDepartment,
} from "../../department-state";
import "./DepartmentDetail.css";

const scopeNames = {
  school: "学校",
  region: "区域",
  grade: "年级",
  college: "院系",
};
export function DepartmentDetail({
  selected,
  data,
  orgName,
  busy,
  onEdit,
  onDelete,
}: {
  selected: string;
  data: DepartmentTree;
  orgName: string;
  busy: boolean;
  onEdit: (row: DepartmentNode) => void;
  onDelete: (row: DepartmentNode) => void;
}) {
  const [tab, setTab] = useState("members");
  const row = flattenDepartments(data.items).find((row) => row.id === selected);
  const unassigned = selected === unassignedDepartment;
  const root = selected === organizationRoot || !row;
  return (
    <section className="department-detail" aria-label="部门详情">
      <header className="department-detail-heading">
        <div>
          <h2>{unassigned ? "未分配部门" : (row?.name ?? orgName)}</h2>
          <p>
            {unassigned
              ? `${data.unassignedMemberCount} 人尚未分配部门`
              : root
                ? "本组织的部门与人员安排"
                : `上级：${row?.parentId ? departmentPath(data.items, row.parentId, orgName) : orgName} · ${row?.memberCount} 人`}
          </p>
        </div>
        {row && !unassigned && (
          <div className="department-detail-actions">
            {row.isPreset && (
              <Chip size="sm" variant="soft">
                预置部门
              </Chip>
            )}
            {row.allowedActions.includes("update") && (
              <Button
                variant="secondary"
                isDisabled={busy}
                onPress={() => onEdit(row)}
              >
                编辑部门
              </Button>
            )}
            {row.allowedActions.includes("delete") && (
              <Button
                variant="danger-soft"
                isDisabled={busy}
                onPress={() => onDelete(row)}
              >
                删除部门
              </Button>
            )}
          </div>
        )}
      </header>
      {row && !unassigned && (
        <div className="department-scope-summary">
          <span>负责范围</span>
          {row.scopeSummary.length ? (
            row.scopeSummary.map((scope) => (
              <Chip key={scope.type} size="sm" variant="soft">
                {scope.count} 个{scopeNames[scope.type]}
              </Chip>
            ))
          ) : (
            <span>尚未配置</span>
          )}
        </div>
      )}
      <Tabs
        aria-label="部门信息"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key))}
        className="department-detail-tabs"
      >
        <Tabs.List>
          <Tabs.Tab id="members">
            成员
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="scopes" isDisabled={unassigned || root}>
            负责范围
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel id="members">
          <div className="department-detail-unavailable">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="9" cy="8" r="3" />
              <path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 4v2" />
            </svg>
            <strong>成员列表暂未开放</strong>
            <p>
              部门人数已按实际成员统计。成员明细与分配功能将在成员管理开放后提供。
            </p>
          </div>
        </Tabs.Panel>
        <Tabs.Panel id="scopes">
          <div className="department-detail-unavailable">
            <strong>负责范围配置暂未开放</strong>
            <p>
              已配置的范围显示在上方。范围选择与实际可见数量将在负责范围功能开放后提供。
            </p>
          </div>
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
