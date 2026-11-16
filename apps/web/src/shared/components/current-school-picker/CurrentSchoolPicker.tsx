import { Button, Popover } from "@heroui/react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { SchoolOptions } from "../school-options/SchoolOptions";
import "./CurrentSchoolPicker.css";

export function CurrentSchoolPicker({
  name,
  ...options
}: ComponentProps<typeof SchoolOptions> & { name: string | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button
        aria-label={`当前学校：${name ?? "请选择学校"}`}
        className="current-school-trigger"
        aria-busy={options.status.loading}
      >
        <span>{name ?? "请选择学校"}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      <Popover.Content
        placement="bottom start"
        className="current-school-popover"
      >
        <Popover.Dialog aria-label="选择当前学校">
          <SchoolOptions
            {...options}
            onSelect={(school) => {
              options.onSelect(school);
              setOpen(false);
            }}
          />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
