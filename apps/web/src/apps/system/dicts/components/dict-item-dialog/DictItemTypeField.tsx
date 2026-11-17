import { Input, Label, TextField } from "@heroui/react";
export function DictItemTypeField({ name }: { name: string }) {
  return (
    <TextField
      value={name}
      isReadOnly
      className="schema-form-field dict-item-type-field"
    >
      <Label>所属字典</Label>
      <Input />
    </TextField>
  );
}
