import { Button, Modal } from "@heroui/react";
import {
  confirmRegionSyncSchema,
  type RegionSyncPreview,
} from "@smart-sport/contracts";
import { useState } from "react";
import { TableListState } from "../../../../../shared/components/data-table/components/table-list-state/TableListState";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { RegionSyncSummary } from "../region-sync-summary/RegionSyncSummary";
import "./RegionSyncDialog.css";
export function RegionSyncDialog({
  identityId,
  preview,
  loading,
  error,
  onRetry,
  onReload,
  onConfirm,
  onClose,
}: {
  identityId: string;
  preview: RegionSyncPreview | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onReload: () => Promise<RegionSyncPreview>;
  onConfirm: (
    fingerprint: string,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<RegionSyncPreview>();
  const current = loaded ?? preview;
  if (loading || error || !current)
    return (
      <Modal
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Modal.Backdrop>
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog className="region-sync-dialog">
              <Modal.Header>
                <Modal.Heading>同步最新区划</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <TableListState
                  loading={loading}
                  error={error}
                  onRetry={onRetry}
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={onClose}>
                  取消
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  return (
    <FormDialog
      title="同步最新区划"
      description="先核对变更和影响，再确认同步"
      dialogClassName="region-sync-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:region-sync`}
      schema={confirmRegionSyncSchema}
      initialValues={{ fingerprint: current.fingerprint }}
      fields={[]}
      beforeForm={<RegionSyncSummary preview={current} />}
      disabled={
        current.blocked ||
        current.changes.length === 0 ||
        !current.allowedActions.includes("import")
      }
      rule="同步不会自动改变学校和教育局的归属。有撤销或改隶影响时，须先处理关联；同步完成后将记录平台操作日志。"
      submitLabel="开始同步"
      onSubmit={(values, context) => onConfirm(values.fingerprint, context)}
      onReload={async () => {
        const next = await onReload();
        setLoaded(next);
        return { values: { fingerprint: next.fingerprint } };
      }}
    />
  );
}
