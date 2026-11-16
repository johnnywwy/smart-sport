import { Button, Chip, Modal, Spinner, Tabs } from "@heroui/react";
import type { identityVisibleSchema } from "@smart-sport/contracts";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type { TableQuery } from "../../../../../shared/components/data-table/types";
import { scopeWarnings } from "../../scope-state";
import "./VisibleScopeDialog.css";

const scopeLabels = {
  all: "本机构全部",
  dept_and_below: "本部门及以下",
  dept: "本部门",
  personal: "本人负责",
};
type Visible = ReturnType<typeof identityVisibleSchema.parse>;
export function VisibleScopeDialog({
  name,
  data,
  loading,
  error,
  query,
  onQueryChange,
  onRetry,
  onClose,
}: {
  name: string;
  data: Visible | undefined;
  loading: boolean;
  error: boolean;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="visible-scope-dialog">
            <Modal.Header className="visible-scope-dialog-header">
              <div>
                <Modal.Heading>实际可见范围 · {name}</Modal.Heading>
                <p>{data?.permissionName ?? "正在计算"}</p>
              </div>
              <Button
                isIconOnly
                variant="secondary"
                aria-label="关闭计算过程"
                onPress={onClose}
              >
                ×
              </Button>
            </Modal.Header>
            <Modal.Body>
              {loading ? (
                <div role="status">
                  <Spinner size="sm" />
                  正在计算…
                </div>
              ) : error ? (
                <div role="alert">
                  <p>计算失败，请重新加载。</p>
                  <Button variant="secondary" onPress={onRetry}>
                    重新加载
                  </Button>
                </div>
              ) : (
                data && (
                  <>
                    <p className="visible-scope-total">
                      实际可见 <strong>{data.schoolCount}</strong> 所启用学校
                    </p>
                    {data.warnings.map((warning) => (
                      <p className="visible-scope-warning" key={warning}>
                        {scopeWarnings[warning]}
                      </p>
                    ))}
                    <Tabs aria-label="可见范围详情">
                      <Tabs.List>
                        <Tabs.Tab id="calculation">
                          计算过程
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="schools">
                          学校明细
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </Tabs.List>
                      <Tabs.Panel id="calculation">
                        <div className="visible-scope-roles">
                          <span>贡献角色</span>
                          {data.roles.length ? (
                            data.roles.map((role) => (
                              <Chip key={role.id} variant="soft">
                                {role.name} · {scopeLabels[role.dataScope]}
                              </Chip>
                            ))
                          ) : (
                            <span>没有角色授予此操作</span>
                          )}
                        </div>
                        <ol className="visible-scope-steps">
                          {data.steps.map((step) => (
                            <li key={`${step.kind}:${step.name}`}>
                              <span>{step.name}</span>
                              <strong>{step.schoolCount} 所学校</strong>
                            </li>
                          ))}
                        </ol>
                      </Tabs.Panel>
                      <Tabs.Panel id="schools">
                        <DataTable
                          scopeKey={`${data.identityId}:${data.permission}`}
                          config={{
                            title: "可见学校",
                            searchPlaceholder: "搜索学校名称",
                            permissions: [],
                            rowLabel: (row) => row.name,
                            columns: [
                              {
                                id: "name",
                                label: "学校名称",
                                render: (row) => row.name,
                              },
                              {
                                id: "region",
                                label: "所属地区",
                                render: (row) => row.regionName,
                              },
                            ],
                          }}
                          data={data}
                          query={query}
                          onQueryChange={onQueryChange}
                          status={{ loading, error, onRetry }}
                        />
                      </Tabs.Panel>
                    </Tabs>
                  </>
                )
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
