import { Checkbox, CheckboxGroup, Label, ListBox, Select } from "@heroui/react";
import type { SchoolProfile } from "@smart-sport/contracts";
import { useId } from "react";
import { selectedStageYears, stageOptions } from "../../profile-state";
import "./ProfileStages.css";

export function ProfileStages({
  stages,
  stageYears,
  disabled,
  readOnly,
  onChange,
}: {
  stages: SchoolProfile["stages"];
  stageYears: SchoolProfile["stageYears"];
  disabled: boolean;
  readOnly: boolean;
  onChange: (
    stages: SchoolProfile["stages"],
    years: SchoolProfile["stageYears"],
  ) => void;
}) {
  const labelId = useId();
  return (
    <section className="school-profile-stages" aria-labelledby={labelId}>
      <h3 id={labelId}>学段与学制</h3>
      <CheckboxGroup
        aria-label="学校学段"
        className="school-profile-stage-options"
        value={stages.map(String)}
        isDisabled={disabled}
        isReadOnly={readOnly}
        onChange={(keys) => {
          const selected = stageOptions
            .filter((stage) => keys.includes(String(stage.id)))
            .map((stage) => stage.id);
          onChange(selected, selectedStageYears(selected, stageYears));
        }}
      >
        {stageOptions.map((stage) => (
          <Checkbox key={stage.id} value={String(stage.id)}>
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label>{stage.name}</Label>
            </Checkbox.Content>
          </Checkbox>
        ))}
      </CheckboxGroup>
      <div className="school-profile-years">
        {stageOptions
          .filter((stage) => stages.includes(stage.id))
          .map((stage) => (
            <Select
              key={stage.id}
              aria-label={`${stage.name}学制`}
              value={String(
                stageYears[String(stage.id) as keyof typeof stageYears] ??
                  stage.defaultYears,
              )}
              isDisabled={disabled || readOnly}
              onChange={(year) => {
                const value = stage.years.find((item) => String(item) === year);
                if (value)
                  onChange(stages, {
                    ...stageYears,
                    [String(stage.id)]: value,
                  });
              }}
            >
              <Label>{stage.name}学制</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {stage.years.map((year) => (
                    <ListBox.Item
                      key={year}
                      id={String(year)}
                      textValue={`${year}年制`}
                    >
                      {year}年制
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          ))}
      </div>
      {readOnly && <p>学段与学制由平台维护，需要修改请联系平台。</p>}
    </section>
  );
}
