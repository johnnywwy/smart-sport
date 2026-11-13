import { Label, Radio, RadioGroup } from "@heroui/react";
import type { DataScopeOption, IdentityType } from "@smart-sport/contracts";
import { scopeLabels } from "../permission-state";
import "./ScopeOptions.css";

export function ScopeOptions({
  value,
  type,
  disabled,
  onChange,
}: {
  value: DataScopeOption;
  type: IdentityType;
  disabled: boolean;
  onChange: (value: DataScopeOption) => void;
}) {
  const school = type === "school" || type === "teacher";
  const descriptions = {
    all: school ? "本校所有年级和班级" : "本机构外边界内的全部数据",
    dept_and_below: "本部门及所有下级部门的负责范围",
    dept: "仅本部门的负责范围",
    personal: "如教师只看任教班级",
  };
  return (
    <RadioGroup
      aria-label="能看到哪些数据"
      orientation="horizontal"
      value={value}
      isDisabled={disabled}
      onChange={(next) => onChange(next as DataScopeOption)}
      className="template-scope-options"
    >
      {Object.entries(scopeLabels).map(([key, label]) => (
        <Radio key={key} value={key} className="template-scope-option">
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Label>
              <span className="template-scope-title">
                {key === "all" && school ? "全校" : label}
              </span>
              <span className="template-scope-description">
                {descriptions[key as DataScopeOption]}
              </span>
            </Label>
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
}
