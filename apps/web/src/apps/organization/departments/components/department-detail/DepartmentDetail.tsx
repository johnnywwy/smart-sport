import { Button, Chip, Tabs } from "@heroui/react";
import type { DepartmentNode, DepartmentTree } from "@smart-sport/contracts";
import { type ReactNode, useState } from "react";
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
  membersContent,
  scopesContent,
  onEdit,
  onDelete,
}: {
  selected: string;
  data: DepartmentTree;
  orgName: string;
  busy: boolean;
  membersContent: ReactNode;
  scopesContent: ReactNode;
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
        <Tabs.Panel id="members">{membersContent}</Tabs.Panel>
        <Tabs.Panel id="scopes">{scopesContent}</Tabs.Panel>
      </Tabs>
    </section>
  );
}
