import { useState } from "react";

type FormError = Error & { fields?: Record<string, string[]> };

function isSessionChanged(error: unknown) {
  return error instanceof Error && error.name === "SessionChangedError";
}

function getFields(error: unknown) {
  if (!(error instanceof Error) || !("fields" in error)) return {};
  return (error as FormError).fields ?? {};
}

export function useAuthForm() {
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const reset = () => {
    setMessage("");
    setFields({});
  };
  const fail = (error: unknown) => {
    if (isSessionChanged(error)) return;
    setMessage("");
    setFields(getFields(error));
  };
  return { message, fields, reset, fail };
}
