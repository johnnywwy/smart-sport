import { Button, Modal } from "@heroui/react";
import type { DictItem } from "@smart-sport/contracts";
import "./DictItemDetails.css";
export function DictItemDetails({
  row,
  typeName,
  onClose,
}: {
  row: DictItem;
  typeName: string;
  onClose: () => void;
}) {
  const fields = [
    ["所属字典", typeName],
    ["来源", row.isSystem ? "系统内置" : "自定义"],
    ["说明", row.description || "暂无说明"],
    ["状态", row.enabled ? "启用" : "停用"],
    ["顺序", String(row.sort)],
    ["使用情况", row.used ? "已使用" : "尚未使用"],
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
          <Modal.Dialog className="dict-item-details">
            <Modal.Header className="dict-item-details-header">
              <Modal.Heading>查看选项 · {row.label}</Modal.Heading>
              <Button
                aria-label="关闭"
                isIconOnly
                variant="secondary"
                onPress={onClose}
              >
                ×
              </Button>
            </Modal.Header>
            <Modal.Body className="dict-item-details-body">
              <dl>
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>
                {row.isSystem
                  ? "系统内置选项只读，不能修改和删除。"
                  : row.used
                    ? "此选项已被使用，可以修改或停用，不能删除。"
                    : "自定义选项，可按权限修改或删除。"}
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
