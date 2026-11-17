import { Button, Dropdown, Label } from "@heroui/react";
import type { AcademicYear, Semester } from "@smart-sport/contracts";
import "./AcademicRowActions.css";

export function AcademicRowActions({
  year,
  onEdit,
  onCurrent,
  onView,
}: {
  year: AcademicYear;
  onEdit: (semester: Semester) => void;
  onCurrent: (semester: Semester) => void;
  onView: () => void;
}) {
  const editable = year.semesters.filter((s) =>
    s.allowedActions.includes("update"),
  );
  const selectable = year.semesters.filter((s) =>
    s.allowedActions.includes("set-current"),
  );
  return (
    <div className="academic-row-actions">
      {editable.length > 0 ? (
        <Dropdown>
          <Button variant="ghost" size="sm" aria-label={`编辑${year.name}日期`}>
            编辑日期
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="选择要编辑的学期">
              {editable.map((semester) => (
                <Dropdown.Item
                  key={semester.id}
                  id={semester.id}
                  textValue={semester.name}
                  onAction={() => onEdit(semester)}
                >
                  <Label>{semester.name}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`查看${year.name}`}
          onPress={onView}
        >
          查看
        </Button>
      )}
      {selectable.length > 0 && (
        <Dropdown>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`设置${year.name}当前学期`}
          >
            设为当前
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="选择要设为当前的学期">
              {selectable.map((semester) => (
                <Dropdown.Item
                  key={semester.id}
                  id={semester.id}
                  textValue={semester.name}
                  onAction={() => onCurrent(semester)}
                >
                  <Label>{semester.name}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      )}
    </div>
  );
}
