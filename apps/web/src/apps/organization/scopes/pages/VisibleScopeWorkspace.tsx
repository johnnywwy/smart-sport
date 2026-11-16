import { Button, ListBox, Select, Spinner } from "@heroui/react";
import { scopeSchoolsQuerySchema } from "@smart-sport/contracts";
import { useState } from "react";
import { VisibleScopeDialog } from "../components/visible-scope-dialog/VisibleScopeDialog";
import { useVisibleScope } from "../hooks/use-visible-scope";
import { scopePermissionOptions, scopeWarnings } from "../scope-state";
export function VisibleScopeWorkspace({
  identityId,
  targetId,
  targetName,
  active,
}: {
  identityId: string;
  targetId: string;
  targetName: string;
  active: boolean;
}) {
  const [permission, setPermission] = useState(
    scopeSchoolsQuerySchema.parse({}).permission,
  );
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState({
    page: 1,
    pageSize: 20,
    keyword: "",
    filters: {},
    deleted: false,
  });
  const query = scopeSchoolsQuerySchema.parse({
    permission,
    page: open ? table.page : 1,
    pageSize: open ? table.pageSize : 20,
    ...(open && table.keyword.trim() ? { keyword: table.keyword.trim() } : {}),
  });
  const visible = useVisibleScope(identityId, targetId, query, active);
  return (
    <section className="visible-scope-summary" aria-label="实际可见范围">
      <Select
        aria-label="计算哪项操作的可见范围"
        value={permission}
        onChange={(value) => {
          const parsed = scopeSchoolsQuerySchema.safeParse({
            permission: value,
          });
          if (parsed.success) {
            setPermission(parsed.data.permission);
            setTable({ ...table, page: 1, keyword: "" });
          }
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {scopePermissionOptions.map((item) => (
              <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                {item.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {!active ? (
        <p>身份或账号已停用，暂不计算实际可见范围。</p>
      ) : visible.isPending ? (
        <div role="status">
          <Spinner size="sm" />
          正在计算实际可见范围…
        </div>
      ) : visible.isError ? (
        <div role="alert">
          <p>实际可见范围读取失败。</p>
          <Button variant="secondary" onPress={() => void visible.refetch()}>
            重新计算
          </Button>
        </div>
      ) : (
        visible.data && (
          <>
            <div className="visible-scope-summary-row">
              <strong>
                {visible.data.supported
                  ? `实际可见 ${visible.data.schoolCount} 所学校`
                  : "当前身份的范围计算暂未开放"}
              </strong>
              <Button variant="secondary" onPress={() => setOpen(true)}>
                查看计算过程
              </Button>
            </div>
            {visible.data.warnings.map((warning) => (
              <p className="visible-scope-warning" key={warning}>
                {scopeWarnings[warning]}
              </p>
            ))}
            <p>
              按所选操作单独计算，只包含授予该操作的角色。修改部门、角色或负责范围后重新计算。
            </p>
          </>
        )
      )}
      {open && active && (
        <VisibleScopeDialog
          name={targetName}
          data={visible.data}
          loading={visible.isPending}
          error={visible.isError}
          query={table}
          onQueryChange={setTable}
          onRetry={() => void visible.refetch()}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
