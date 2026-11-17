import { Button, Chip, Modal } from "@heroui/react";
import type { AcademicYear } from "@smart-sport/contracts";
import { academicStatus } from "../../academic-state";
import { SemesterSummary } from "../semester-summary/SemesterSummary";
import "./ViewYearDialog.css";

export function ViewYearDialog({
  year,
  onClose,
}: {
  year: AcademicYear;
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
        <Modal.Container placement="center">
          <Modal.Dialog className="academic-view-dialog">
            <Modal.Header className="academic-view-heading">
              <div>
                <Modal.Heading>{year.name}</Modal.Heading>
                <Chip size="sm" variant="soft">
                  {academicStatus[year.status]}
                </Chip>
              </div>
              <Button
                isIconOnly
                variant="secondary"
                aria-label="关闭"
                onPress={onClose}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </Button>
            </Modal.Header>
            <Modal.Body>
              <SemesterSummary semesters={year.semesters} />
              <p>
                {year.status === "closed"
                  ? "该学年已结束，学期日期只能查看。"
                  : "当前身份可以查看学期日期，修改需相应权限。"}
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
