import type { ResetPresetRole, SavePresetRole } from "@smart-sport/contracts";
import { useEffect, useRef, useState } from "react";
import { createFormSubmission } from "../../../../shared/components/schema-form/form-submission";
import type {
  FormSnapshot,
  FormSubmissionContext,
} from "../../../../shared/components/schema-form/types";
import { SessionChangedError } from "../../../../shared/errors/api-error";
import { templateResetInput } from "../template-state";

export function useTemplateReset({
  version,
  onReset,
  onReload,
  onBusy,
}: {
  version: number;
  onReset: (
    input: ResetPresetRole,
    context: FormSubmissionContext,
    name?: string,
  ) => Promise<void>;
  onReload: () => Promise<FormSnapshot<SavePresetRole>>;
  onBusy: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submission] = useState(createFormSubmission);
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    submission.reset();
    return () => {
      mounted.current = false;
      submission.dispose();
      onBusy(false);
    };
  }, [onBusy, submission]);
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
    reset: (feature?: { app: string; feature: string }, name?: string) =>
      run(() =>
        submission.run(templateResetInput(version, feature), (input, context) =>
          onReset(input, context, name),
        ),
      ),
    reload: () =>
      run(async () => {
        await onReload();
        submission.reset();
      }),
  };
}
