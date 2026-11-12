import { Form } from "@heroui/react";
import { useSchemaForm } from "../../hooks/use-schema-form";
import type { SchemaFormProps } from "../../types";
import { FormActions } from "../form-actions/FormActions";
import { FormFeedback } from "../form-feedback/FormFeedback";
import { FormField } from "../form-field/FormField";

export function FormContent<T>(props: SchemaFormProps<T>) {
  const state = useSchemaForm(props);
  const appearance = props.appearance ?? "default";
  const disabled = state.pending || Boolean(props.disabled);
  const extraErrors = Object.entries(state.errors)
    .filter(([name]) => !props.fields.some((field) => field.name === name))
    .flatMap(([, messages]) => messages);
  return (
    <Form
      className={`schema-form schema-form-${appearance}`}
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        void state.submit();
      }}
    >
      <div
        className={`schema-form-fields${props.columns === 2 ? " schema-form-fields-two" : ""}`}
      >
        {props.fields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            value={state.values[field.name]}
            error={state.errors[field.name]?.[0]}
            showRequired={appearance !== "auth"}
            disabled={disabled}
            onChange={state.change}
          />
        ))}
      </div>
      {typeof props.children === "function"
        ? props.children({
            values: state.values,
            errors: state.errors,
            disabled,
            setValue: state.change,
          })
        : props.children}
      {props.rule && <p className="schema-form-rule">{props.rule}</p>}
      <FormFeedback
        message={[state.feedback, ...extraErrors].filter(Boolean).join(" ")}
        conflict={state.conflict}
        pending={state.pending}
        {...(props.onReload
          ? {
              onReload: () => {
                void state.reload();
              },
            }
          : {})}
      />
      <FormActions
        label={props.submitLabel}
        pending={state.pending}
        disabled={disabled || state.conflict}
        appearance={appearance}
        onCancel={props.onCancel}
      />
    </Form>
  );
}
