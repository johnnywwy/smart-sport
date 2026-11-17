import type { DictItem, DictTypeCode } from "@smart-sport/contracts";
import { useState } from "react";
import { TableListState } from "../../../../shared/components/data-table/components/table-list-state/TableListState";
import { DeleteDictItemDialog } from "../components/delete-dict-item-dialog/DeleteDictItemDialog";
import { DictItemDetails } from "../components/dict-item-details/DictItemDetails";
import { CreateDictItemDialog } from "../components/dict-item-dialog/CreateDictItemDialog";
import { EditDictItemDialog } from "../components/dict-item-dialog/EditDictItemDialog";
import { DictItemList } from "../components/dict-item-list/DictItemList";
import { DictTypeList } from "../components/dict-type-list/DictTypeList";
import { initialDictQuery } from "../dict-state";
import { useDicts } from "../hooks/use-dicts";
import "./DictionariesPage.css";

type Dialog =
  | { kind: "create" }
  | { kind: "view" | "edit" | "delete"; row: DictItem };
export function DictionariesPage({ identityId }: { identityId: string }) {
  const [selected, setSelected] = useState<DictTypeCode>();
  const [query, setQuery] = useState(initialDictQuery);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const data = useDicts(identityId, selected, query);
  const lastPage = Math.max(
    1,
    Math.ceil((data.items.data?.total ?? 0) / query.pageSize),
  );
  if (data.items.data && !data.items.isFetching && query.page > lastPage)
    setQuery({ ...query, page: lastPage });
  const close = () => setDialog(null),
    type = data.type;
  return (
    <div className="dictionaries-page">
      <DictItemList
        identityId={identityId}
        type={type}
        query={query}
        onQueryChange={setQuery}
        data={
          data.items.data ?? {
            items: [],
            total: 0,
            page: query.page,
            pageSize: query.pageSize,
          }
        }
        status={{
          loading: data.types.isPending || (!!type && data.items.isPending),
          error: data.types.isError || (!!type && data.items.isError),
          onRetry: () => {
            if (data.types.isError) void data.types.refetch();
            else void data.items.refetch();
          },
        }}
        sidebar={
          data.types.isPending || data.types.isError ? (
            <TableListState
              loading={data.types.isPending}
              error={data.types.isError}
              onRetry={() => void data.types.refetch()}
            />
          ) : (
            <DictTypeList
              types={data.types.data ?? []}
              selected={type?.code}
              onSelect={(code) => {
                setSelected(code);
                setQuery({ ...initialDictQuery, pageSize: query.pageSize });
                close();
              }}
            />
          )
        }
        actions={{
          create: () => setDialog({ kind: "create" }),
          view: (row) => setDialog({ kind: "view", row }),
          edit: (row) => setDialog({ kind: "edit", row }),
          remove: (row) => setDialog({ kind: "delete", row }),
        }}
      />
      {type && dialog?.kind === "create" && (
        <CreateDictItemDialog
          key={`${identityId}:${type.code}:create`}
          identityId={identityId}
          type={type}
          onClose={close}
          onSave={async (values, context) => {
            await data.create(type.code, values, context);
            setQuery({ ...initialDictQuery, pageSize: query.pageSize });
          }}
        />
      )}
      {type && dialog?.kind === "edit" && (
        <EditDictItemDialog
          key={`${identityId}:${dialog.row.id}`}
          identityId={identityId}
          typeName={type.name}
          row={dialog.row}
          onClose={close}
          onSave={async (values, context) => {
            await data.save(dialog.row.id, values, context);
          }}
          onReload={() => data.reload(dialog.row.typeCode, dialog.row.id)}
        />
      )}
      {type && dialog?.kind === "view" && (
        <DictItemDetails
          row={dialog.row}
          typeName={type.name}
          onClose={close}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteDictItemDialog
          key={`${identityId}:${dialog.row.id}:delete`}
          identityId={identityId}
          row={dialog.row}
          onClose={close}
          onDelete={async (version, context) => {
            await data.remove(
              dialog.row.id,
              dialog.row.label,
              version,
              context,
            );
            if (data.items.data?.items.length === 1 && query.page > 1)
              setQuery({ ...query, page: query.page - 1 });
          }}
          onReload={() => data.reload(dialog.row.typeCode, dialog.row.id)}
        />
      )}
    </div>
  );
}
