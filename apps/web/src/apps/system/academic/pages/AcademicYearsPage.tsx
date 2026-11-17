import { useState } from "react";
import { ApiError } from "../../../../shared/errors/api-error";
import {
  academicPermissions,
  initialAcademicQuery,
  suggestedAcademicYear,
} from "../academic-state";
import { AcademicList } from "../components/academic-list/AcademicList";
import { CreateYearDialog } from "../components/create-year-dialog/CreateYearDialog";
import { CurrentSemesterDialog } from "../components/current-semester-dialog/CurrentSemesterDialog";
import { EditSemesterDialog } from "../components/edit-semester-dialog/EditSemesterDialog";
import { ViewYearDialog } from "../components/view-year-dialog/ViewYearDialog";
import { useAcademicYears } from "../hooks/use-academic-years";
import "./AcademicYearsPage.css";

type Dialog =
  | { kind: "create" }
  | {
      kind: "view" | "edit" | "current";
      yearId: string;
      semesterId?: string | undefined;
    };
export function AcademicYearsPage({ identityId }: { identityId: string }) {
  const data = useAcademicYears(identityId);
  const [query, setQuery] = useState(initialAcademicQuery);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const forbidden =
    data.years.error instanceof ApiError &&
    [403, 404].includes(data.years.error.status);
  const years = forbidden ? [] : (data.years.data ?? []);
  const permissions = academicPermissions(
    data.capabilities.isError
      ? []
      : (data.capabilities.data?.allowedActions ?? []),
  );
  const year =
    dialog && dialog.kind !== "create"
      ? years.find((y) => y.id === dialog.yearId)
      : undefined;
  const semester =
    year && dialog && "semesterId" in dialog
      ? year.semesters.find((s) => s.id === dialog.semesterId)
      : undefined;
  const close = () => setDialog(null);
  return (
    <div className="academic-years-page">
      <AcademicList
        identityId={identityId}
        years={years}
        permissions={permissions}
        query={query}
        onQueryChange={setQuery}
        status={{
          loading: data.years.isPending || data.capabilities.isPending,
          error: data.years.isError || data.capabilities.isError,
          onRetry: data.retry,
        }}
        onCreate={() => setDialog({ kind: "create" })}
        onSelect={(row, kind, semester) =>
          setDialog({ kind, yearId: row.id, semesterId: semester?.id })
        }
      />
      <p className="academic-years-note">
        这里只定日期。各学校的升年级和毕业，在基础信息的“学年升级”里各自办理。
      </p>
      {dialog?.kind === "create" &&
        permissions.includes("system:academic:create") && (
          <CreateYearDialog
            identityId={identityId}
            startYear={suggestedAcademicYear(years)}
            onClose={close}
            onSave={data.create}
          />
        )}
      {dialog?.kind === "view" && year && (
        <ViewYearDialog year={year} onClose={close} />
      )}
      {dialog?.kind === "edit" && year && semester && (
        <EditSemesterDialog
          identityId={identityId}
          year={year}
          semester={semester}
          onClose={close}
          onSave={(value, context) => data.save(semester.id, value, context)}
          onReload={() => data.reloadSemester(semester.id)}
        />
      )}
      {dialog?.kind === "current" && year && semester && (
        <CurrentSemesterDialog
          identityId={identityId}
          year={year}
          semester={semester}
          currentYear={years.find((y) => y.isCurrent)}
          onClose={close}
          onSave={(version, context) =>
            data.setCurrent(semester.id, version, context)
          }
          onReload={() => data.reloadSemester(semester.id)}
        />
      )}
    </div>
  );
}
