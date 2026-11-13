import {
  type ResetRole,
  resetRoleSchema,
  type SaveRoleGrants,
} from "@smart-sport/contracts";
import { useEffect, useRef, useState } from "react";
import { createFormSubmission } from "../../../../shared/components/schema-form/form-submission";
import type {
  FormSnapshot,
  FormSubmissionContext,
} from "../../../../shared/components/schema-form/types";
import { SessionChangedError } from "../../../../shared/errors/api-error";

export function useRoleReset({
  version,
  onReset,
  onReload,
  onBusy,
}: {
  version: number;
  onReset: (values: ResetRole, context: FormSubmissionContext) => Promise<void>;
  onReload: () => Promise<FormSnapshot<SaveRoleGrants>>;
  onBusy: (busy: boolean) => void;
}) {
  const [submission] = useState(createFormSubmission);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    submission.reset();
    return () => {
      mounted.current = false;
      submission.dispose();
      onBusy(false);
    };
  }, [submission, onBusy]);
  const run = async (action: () => Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError("");
    onBusy(true);
    try {
      await action();
    } catch (failure) {
      if (
        mounted.current &&
        !(failure instanceof SessionChangedError) &&
        !(failure instanceof DOMException && failure.name === "AbortError")
      )
        setError(
          failure instanceof Error
            ? failure.message
            : "恢复失败，请重新加载后重试。",
        );
    } finally {
      locked.current = false;
      if (mounted.current) {
        setPending(false);
        onBusy(false);
      }
    }
  };
  return {
    pending,
    error,
    reset: () =>
      run(() => submission.run(resetRoleSchema.parse({ version }), onReset)),
    reload: () =>
      run(async () => {
        await onReload();
        submission.reset();
      }),
  };
}
