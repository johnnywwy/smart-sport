import { Button } from "@heroui/react";
import { useState } from "react";
import { ApiError } from "../../../../shared/errors/api-error";
import { ProfileDialog } from "../components/profile-dialog/ProfileDialog";
import { ProfileState } from "../components/profile-state/ProfileState";
import { ProfileSummary } from "../components/profile-summary/ProfileSummary";
import { SchoolServiceSummary } from "../components/school-service-summary/SchoolServiceSummary";
import { useSchoolProfile } from "../hooks/use-school-profile";
import { useSchoolService } from "../hooks/use-school-service";
import "./SchoolProfilePage.css";

export function SchoolProfilePage({
  identityId,
  schoolId,
  platformManaged,
  regionName,
  onBack,
}: {
  identityId: string;
  schoolId: string;
  platformManaged: boolean;
  regionName?: string | undefined;
  onBack?: (() => void) | undefined;
}) {
  const { profile, save, reload } = useSchoolProfile(identityId, schoolId);
  const service = useSchoolService(identityId, schoolId);
  const serviceCard = (
    <SchoolServiceSummary
      service={service.data}
      loading={service.isPending}
      error={service.isError}
      onRetry={() => void service.refetch()}
    />
  );
  const [editing, setEditing] = useState(false);
  const unavailable =
    profile.error instanceof ApiError &&
    (profile.error.status === 403 || profile.error.status === 404);
  const data = unavailable ? undefined : profile.data;
  return (
    <div className="school-profile-page">
      <header className="school-profile-heading">
        <div>
          <h1>学校管理</h1>
          {onBack && (
            <Button size="sm" variant="ghost" onPress={onBack}>
              返回学校列表
            </Button>
          )}
        </div>
        {data?.allowedActions.includes("update") &&
          service.data?.accessMode === "full" && (
            <Button onPress={() => setEditing(true)}>编辑档案</Button>
          )}
      </header>
      {!data ? (
        <>
          <ProfileState
            loading={profile.isPending}
            error={profile.error}
            onRetry={() => void profile.refetch()}
          />
          <div className="school-profile-panels">{serviceCard}</div>
        </>
      ) : (
        <>
          <ProfileSummary
            profile={data}
            regionName={regionName}
            service={serviceCard}
          />
          {editing && (
            <ProfileDialog
              identityId={identityId}
              profile={data}
              platformManaged={platformManaged}
              onClose={() => setEditing(false)}
              onSave={save}
              onReload={reload}
            />
          )}
        </>
      )}
    </div>
  );
}
