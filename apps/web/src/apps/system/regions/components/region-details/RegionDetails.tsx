import { Button, Modal } from "@heroui/react";
import type { RegionManagementRow } from "@smart-sport/contracts";
import { bureauLabel, regionLevelName } from "../../region-state";
import "./RegionDetails.css";
export function RegionDetails({
  row,
  onClose,
}: {
  row: RegionManagementRow;
  onClose: () => void;
}) {
  const fields = [
    ["级别", regionLevelName(row.level)],
    ["上级", row.parentName ?? "无"],
    ["学校数", `${row.schoolCount} 所`],
    ["对应教育局", bureauLabel(row)],
  ];
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="region-details">
            <Modal.Header>
              <Modal.Heading>{row.name}</Modal.Heading>
              <Button
                aria-label="关闭"
                isIconOnly
                variant="secondary"
                onPress={onClose}
              >
                ×
              </Button>
            </Modal.Header>
            <Modal.Body>
              <dl>
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>学校数包含本级及下级的未删除学校，停用学校仍计数。</p>
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
