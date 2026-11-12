import { Button, Popover, Spinner } from "@heroui/react";
import { FileTree } from "@heroui-pro/react/file-tree";
import type { Region } from "@smart-sport/contracts";
import { useState } from "react";
import "./RegionPicker.css";

type Props = {
  value: string | null;
  selectedLabel?: string;
  regions: readonly Region[];
  loadedParents: ReadonlySet<string>;
  expandedCodes: readonly string[];
  onExpandedChange: (codes: string[]) => void;
  onChange: (code: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
  errorId?: string;
};
export function RegionPicker({
  value,
  selectedLabel,
  regions,
  loadedParents,
  expandedCodes,
  onExpandedChange,
  onChange,
  loading,
  error,
  onRetry,
  disabled = false,
  invalid = false,
  label = "所属地区",
  errorId,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = regions.find((region) => region.code === value);
  const path = selected?.path
    .split(".")
    .map((code) => regions.find((region) => region.code === code)?.name)
    .filter(Boolean)
    .join(" / ");
  const placeholderKeys = regions
    .filter((region) => region.level < 3 && !loadedParents.has(region.code))
    .map((region) => `${region.code}:loading`);
  const renderRegion = (region: Region) => {
    const children = regions.filter(
      (child) => child.parentCode === region.code,
    );
    return (
      <FileTree.Item
        key={region.code}
        id={region.code}
        title={region.name}
        textValue={region.name}
      >
        {children.map(renderRegion)}
        {region.level < 3 && !loadedParents.has(region.code) && (
          <FileTree.Item
            id={`${region.code}:loading`}
            title={error ? "加载失败，请重试" : "展开后加载下级地区"}
          />
        )}
      </FileTree.Item>
    );
  };
  return (
    <Popover isOpen={open && !disabled} onOpenChange={setOpen}>
      <Button
        aria-label={label}
        data-invalid={invalid || undefined}
        {...(invalid && errorId ? { "aria-describedby": errorId } : {})}
        variant="secondary"
        isDisabled={disabled}
        className="region-picker-trigger"
      >
        <span title={path || selectedLabel}>
          {path || selectedLabel || "请选择省 / 市 / 区县"}
        </span>
        <svg
          width="16"
          height="16"
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
        className="region-picker-popover"
      >
        <Popover.Dialog aria-label="选择行政区划">
          <p className="region-picker-help">
            展开省、市选择下级；也可直接选择当前层级。
          </p>
          {loading ? (
            <Spinner aria-label="加载行政区划" />
          ) : (
            <FileTree
              aria-label="省市区行政区划"
              selectionMode="single"
              selectionBehavior="replace"
              selectedKeys={value ? new Set([value]) : new Set()}
              expandedKeys={new Set(expandedCodes)}
              disabledKeys={new Set(placeholderKeys)}
              onExpandedChange={(keys) =>
                onExpandedChange([...keys].map(String))
              }
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const code = String([...keys][0] ?? "");
                if (regions.some((region) => region.code === code)) {
                  onChange(code);
                  setOpen(false);
                }
              }}
            >
              {regions
                .filter((region) => region.parentCode === null)
                .map(renderRegion)}
            </FileTree>
          )}
          {!loading && !error && regions.length === 0 && (
            <p className="region-picker-help">暂无可选地区，请联系管理员。</p>
          )}
          {error && (
            <div className="region-picker-error" role="alert">
              <span>区划加载失败</span>
              <Button size="sm" variant="secondary" onPress={onRetry}>
                重新加载区划
              </Button>
            </div>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
