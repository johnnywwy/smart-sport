import { Button, Modal } from "@heroui/react";
import type { Member } from "@smart-sport/contracts";
import { useState } from "react";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import { useMembers } from "../../hooks/use-members";
import { initialMemberQuery, memberQuery } from "../../member-state";
import "./AddDepartmentMembers.css";
export function AddDepartmentMembers({
  identityId,
  departmentId,
  onSelect,
  onClose,
}: {
  identityId: string;
  departmentId: string | null;
  onSelect: (rows: readonly Member[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialMemberQuery);
  const data = useMembers(identityId, memberQuery(query));
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="add-department-members">
            <Modal.Header className="add-department-header">
              <Modal.Heading>添加本组织已有成员</Modal.Heading>
              <Button
                variant="secondary"
                isIconOnly
                aria-label="关闭添加成员"
                onPress={onClose}
              >
                ×
              </Button>
            </Modal.Header>
            <Modal.Body>
              <DataTable
                scopeKey={identityId}
                data={
                  data.list.data ?? {
                    items: [],
                    page: query.page,
                    pageSize: query.pageSize,
                    total: 0,
                  }
                }
                query={query}
                onQueryChange={setQuery}
                status={{
                  loading: data.list.isPending,
                  error: data.list.isError,
                  onRetry: () => void data.list.refetch(),
                }}
                config={{
                  title: "选择要移入的成员",
                  description: "已有成员将从原部门移入当前部门。",
                  searchPlaceholder: "姓名或账号",
                  permissions: ["org:member:update"],
                  columns: [
                    {
                      id: "name",
                      label: "姓名",
                      render: (row) => row.realName,
                    },
                    {
                      id: "account",
                      label: "账号",
                      render: (row) => row.username,
                    },
                    {
                      id: "department",
                      label: "当前部门",
                      render: (row) => row.departmentName ?? "未分配部门",
                    },
                  ],
                  rowLabel: (row) => row.realName,
                  batchActions: [
                    {
                      id: "add",
                      label: "添加所选成员",
                      permission: "org:member:update",
                      requiredAction: "update",
                      onPress: (rows) => {
                        onSelect(
                          rows.filter(
                            (row) => row.departmentId !== departmentId,
                          ),
                        );
                      },
                    },
                  ],
                }}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
