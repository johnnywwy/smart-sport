import { useEffect, useRef, useState } from "react";
import { SessionChangedError } from "../../../errors/api-error";
import { formFailure, initialFormValues, validateForm } from "../form-state";
import { createFormSubmission } from "../form-submission";
import type { FormErrors, SchemaFormProps } from "../types";

export function useSchemaForm<T>(props: SchemaFormProps<T>) {
  const [values, setValues] = useState(() =>
    initialFormValues(props.fields, props.initialValues),
  );
  const [version, setVersion] = useState(props.version);
  const [errors, setErrors] = useState<FormErrors>({});
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [conflict, setConflict] = useState(false);
  const [submission] = useState(createFormSubmission);
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    // StrictMode 会清理再挂载；重新建立可用的提交周期。
    submission.reset();
    return () => {
      mounted.current = false;
      submission.dispose();
    };
  }, [submission]);
  const setBusy = (busy: boolean) => {
    setPending(busy);
    props.onPendingChange?.(busy);
  };
  const change = (name: string, value: unknown) => {
    if (
      locked.current ||
      props.disabled ||
      props.fields.some((field) => field.name === name && field.readOnly)
    )
      return;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== name),
      ),
    );
    setDismissed((current) => new Set([...current, name]));
  };
  const submit = async () => {
    if (locked.current || props.disabled || conflict) return;
    setDismissed(new Set());
    setFeedback("");
    const parsed = validateForm(props.schema, values, props.fields, version);
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }
    locked.current = true;
    setErrors({});
    setBusy(true);
    try {
      await submission.run(parsed.data, props.onSubmit);
    } catch (error) {
      if (!mounted.current || error instanceof SessionChangedError) return;
      const failure = formFailure(error);
      if (failure.kind === "fields") setErrors(failure.errors);
      else {
        setFeedback(failure.message);
        setConflict(failure.kind === "conflict");
      }
    } finally {
      locked.current = false;
      if (mounted.current) {
        setValues((current) => {
          const next = { ...current };
          for (const field of props.fields)
            if (field.type === "password") next[field.name] = "";
          return next;
        });
        setBusy(false);
      }
    }
  };
  const reload = async () => {
    if (locked.current || !props.onReload) return;
    locked.current = true;
    setBusy(true);
    try {
      const snapshot = await props.onReload();
      if (!mounted.current) return;
      setValues(initialFormValues(props.fields, snapshot.values));
      setVersion(snapshot.version);
      setErrors({});
      setDismissed(new Set());
      setFeedback("");
      setConflict(false);
      submission.reset();
    } catch {
      if (mounted.current)
        setFeedback("重新加载失败，请稍后重试。当前内容尚未保存。");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const visibleErrors = {
    ...Object.fromEntries(
      Object.entries(props.errors ?? {}).filter(
        ([name]) => !dismissed.has(name),
      ),
    ),
    ...errors,
  };
  return {
    values,
    errors: visibleErrors,
    pending,
    feedback,
    conflict,
    change,
    submit,
    reload,
  };
}
