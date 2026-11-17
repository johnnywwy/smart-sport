import { Button, Popover, Spinner } from "@heroui/react";
import type { AcademicYear } from "@smart-sport/contracts";
import { useState } from "react";
import type { SelectedAcademicPeriod } from "../../../../shared/types/academic";
import { AcademicPeriodList } from "../academic-period-list/AcademicPeriodList";
import "./AcademicSwitcher.css";

export type AcademicSwitcherProps = {
  years: readonly AcademicYear[];
  selection: SelectedAcademicPeriod | null;
  status: { loading: boolean; error: boolean; retry: () => void };
  onSelect: (semesterId: string) => void;
};
export function AcademicSwitcher({
  years,
  selection,
  status,
  onSelect,
}: AcademicSwitcherProps) {
  const [open, setOpen] = useState(false);
  const label = status.loading
    ? "正在加载学期"
    : status.error
      ? "学期加载失败"
      : selection
        ? `${selection.academicYear.name} ${selection.semester.name}`
        : years.length
          ? "请选择学年学期"
          : "暂无学年学期";
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        className="academic-switcher-trigger"
        aria-label={`学年学期：${label}`}
        isDisabled={status.loading}
      >
        {status.loading && <Spinner size="sm" />}
        <span>{label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      <Popover.Content
        placement="bottom end"
        className="academic-switcher-popover"
      >
        <Popover.Dialog aria-label="学年学期选择">
          <p className="academic-switcher-note">选择用于查看数据的学期</p>
          {status.error ? (
            <div className="academic-switcher-state" role="alert">
              <p>学年学期加载失败，请重新加载。</p>
              <Button size="sm" variant="secondary" onPress={status.retry}>
                重新加载
              </Button>
            </div>
          ) : !years.length ? (
            <p className="academic-switcher-state" role="status">
              暂无学年学期，请联系平台管理员设置。
            </p>
          ) : (
            <AcademicPeriodList
              years={years}
              selectedId={selection?.semester.id}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
