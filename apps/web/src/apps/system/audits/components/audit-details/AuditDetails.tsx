import { Button, Modal } from "@heroui/react";
import type { AuditLog } from "@smart-sport/contracts";
import {
  auditActionName,
  auditIdentity,
  auditResult,
  auditTarget,
  auditTime,
} from "../../audit-labels";
import { AuditChanges } from "../audit-changes/AuditChanges";
import "./AuditDetails.css";
export function AuditDetails({
  row,
  onClose,
}: {
  row: AuditLog;
  onClose: () => void;
}) {
  const fields = [
    ["操作时间", auditTime(row.createdAt)],
    ["操作人", row.operatorName ?? (row.userId ? "原账号" : "未关联账号")],
    ["当时的身份", auditIdentity(row)],
    ["操作", auditActionName(row.action)],
    ["对象", auditTarget(row)],
    ["结果", auditResult(row).label],
  ];
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="lg" placement="center" scroll="inside">
          <Modal.Dialog className="audit-details">
            <Modal.Header className="audit-details-header">
              <Modal.Heading>操作记录详情</Modal.Heading>
              <Button
                aria-label="关闭"
                isIconOnly
                variant="secondary"
                onPress={onClose}
              >
                ×
              </Button>
            </Modal.Header>
            <Modal.Body className="audit-details-body">
              <dl className="audit-details-fields">
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <AuditChanges changes={row.changes} />
              <p className="audit-details-note">
                名称显示关联资料的当前名称；历史角色未记录时不作推测。“已记录”表示有操作留痕，未额外记录处理结果。
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={onClose}>
                关闭
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
