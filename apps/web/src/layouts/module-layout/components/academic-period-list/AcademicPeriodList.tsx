import { Chip, Header, Label, ListBox } from "@heroui/react";
import type { AcademicYear } from "@smart-sport/contracts";
import "./AcademicPeriodList.css";

export function AcademicPeriodList({
  years,
  selectedId,
  onSelect,
}: {
  years: readonly AcademicYear[];
  selectedId: string | undefined;
  onSelect: (semesterId: string) => void;
}) {
  return (
    <ListBox
      aria-label="选择学年学期"
      className="academic-period-list"
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={new Set(selectedId ? [selectedId] : [])}
    >
      {[...years]
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map((year) => (
          <ListBox.Section key={year.id} id={year.id}>
            <Header className="academic-period-year">{year.name}</Header>
            {year.semesters.map((semester) => (
              <ListBox.Item
                key={semester.id}
                id={semester.id}
                textValue={`${year.name} ${semester.name}`}
                className="academic-period-option"
                onPress={() => onSelect(semester.id)}
              >
                <Label>{semester.name}</Label>
                {year.isCurrent && semester.isCurrent && (
                  <Chip
                    size="sm"
                    variant="soft"
                    className="academic-period-current"
                  >
                    当前
                  </Chip>
                )}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox.Section>
        ))}
    </ListBox>
  );
}
