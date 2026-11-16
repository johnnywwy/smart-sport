import { Button, Spinner } from "@heroui/react";
import { useState } from "react";
import { CurrentSchoolPicker } from "../../../../shared/components/current-school-picker/CurrentSchoolPicker";
import { SchoolOptions } from "../../../../shared/components/school-options/SchoolOptions";
import { useCurrentSchool } from "../../../../shared/hooks/use-current-school";
import type { SchoolPermissions } from "../../../../shared/hooks/use-menu-schools";
import { useMenuSchools } from "../../../../shared/hooks/use-menu-schools";
import "./SchoolWorkspacePage.css";

export function SchoolWorkspacePage({
  identityId,
  name,
  permissions,
}: {
  identityId: string;
  name: string;
  permissions: SchoolPermissions;
}) {
  const [query, setQuery] = useState({ keyword: "", page: 1 });
  const schools = useMenuSchools(
    identityId,
    {
      ...query,
      pageSize: 20,
    },
    permissions,
  );
  const context = useCurrentSchool(identityId, permissions);
  const options = {
    data: schools.isFetching ? undefined : schools.data,
    query,
    onQueryChange: setQuery,
    recent: context.recent,
    onSelect: context.select,
    status: {
      loading: schools.isPending || schools.isFetching,
      error: schools.isError,
      retry: () => void schools.refetch(),
    },
  };
  return (
    <section className="school-workspace">
      <header className="school-workspace-heading">
        <h1>{name}</h1>
        <CurrentSchoolPicker name={context.selected?.name} {...options} />
      </header>
      {context.checking ? (
        <div className="school-workspace-notice" role="status">
          <Spinner size="sm" />
          正在确认学校访问权限…
        </div>
      ) : context.error ? (
        <div className="school-workspace-notice" role="alert">
          学校访问权限校验失败，请重试。
          <Button variant="secondary" onPress={context.retry}>
            重新校验
          </Button>
        </div>
      ) : context.selected ? (
        <div className="school-workspace-notice" role="status">
          <strong>{context.selected.name}</strong>
          <span>{context.selected.regionName}</span>
          <p>
            {name === "院系专业"
              ? "院系专业仅适用于大学，学校类型与院系业务尚未开放。"
              : `${name}业务暂未开放。你可以在标题旁切换学校，或从侧栏选择其他菜单。`}
          </p>
        </div>
      ) : (
        <>
          <p className="school-workspace-description">
            请先选择一所学校，再查看{name}。
          </p>
          <div className="school-workspace-candidates">
            <SchoolOptions {...options} />
          </div>
        </>
      )}
    </section>
  );
}
