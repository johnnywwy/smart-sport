import { FormContent } from "./components/form-content/FormContent";
import type { SchemaFormProps } from "./types";
import "./SchemaForm.css";

export function SchemaForm<T>(props: SchemaFormProps<T>) {
  return <FormContent key={props.scopeKey ?? "form"} {...props} />;
}
