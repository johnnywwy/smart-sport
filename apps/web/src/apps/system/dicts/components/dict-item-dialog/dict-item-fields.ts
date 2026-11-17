import type { FormField } from "../../../../../shared/components/schema-form/types";
export const dictItemFields: readonly FormField[] = [
  {
    name: "label",
    label: "选项名称",
    placeholder: "请输入选项名称",
    validationMessage: "请输入1至64个字符的选项名称",
  },
  {
    name: "sort",
    label: "顺序",
    type: "number",
    validationMessage: "顺序须为0至999999的整数",
  },
  {
    name: "enabled",
    label: "状态",
    type: "select",
    options: [
      { value: true, label: "启用" },
      { value: false, label: "停用" },
    ],
  },
  {
    name: "description",
    label: "说明",
    type: "textarea",
    required: false,
    fullWidth: true,
    placeholder: "选填，最多500个字符",
  },
];
export const dictItemRule =
  "系统内置选项只读。自定义选项使用过后只能停用，不能删除；停用不影响历史记录。";
