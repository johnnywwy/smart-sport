import type {
  SchoolProfile,
  UpdateSchoolProfile,
} from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type {
  FormSnapshot,
  FormSubmissionContext,
} from "../../../../../shared/components/schema-form/types";
import { profileFormSchema, profileValues } from "../../profile-state";
import { ContactPhoneEditor } from "../contact-phone-editor/ContactPhoneEditor";
import { ProfileStages } from "../profile-stages/ProfileStages";
import "./ProfileDialog.css";

export function ProfileDialog({
  identityId,
  profile,
  platformManaged,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  profile: SchoolProfile;
  platformManaged: boolean;
  onClose: () => void;
  onSave: (
    values: UpdateSchoolProfile,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<FormSnapshot<UpdateSchoolProfile>>;
}) {
  return (
    <FormDialog
      title="编辑学校档案"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      schema={profileFormSchema}
      scopeKey={`${identityId}:${profile.schoolId}`}
      initialValues={profileValues(profile)}
      version={profile.version}
      disabled={!profile.allowedActions.includes("update")}
      columns={2}
      submitLabel="保存"
      beforeFields={
        <p className="school-profile-name">学校名称：{profile.schoolName}</p>
      }
      fields={[
        {
          name: "schoolCode",
          label: "学校标识码",
          readOnly: platformManaged,
          readOnlyReason: "由平台维护",
          placeholder: "请输入10位学校标识码",
        },
        {
          name: "nature",
          label: "办学性质",
          type: "select",
          options: [
            { value: "公办", label: "公办" },
            { value: "民办", label: "民办" },
          ],
        },
        {
          name: "contactName",
          label: "联系人",
          required: false,
          placeholder: "请输入联系人姓名",
        },
        {
          name: "contactPhone",
          label: "联系电话",
          required: false,
          type: "custom",
          render: (state) => (
            <ContactPhoneEditor {...state} maskedPhone={profile.contactPhone} />
          ),
        },
        {
          name: "address",
          label: "学校地址",
          required: false,
          fullWidth: true,
          placeholder: "请输入详细地址",
        },
      ]}
      rule="保存后立即生效，修改将记入操作记录。学校名称和所在地区由平台组织信息维护。"
      onSubmit={onSave}
      onReload={onReload}
    >
      {({ values, disabled, setValue }) => (
        <ProfileStages
          stages={values.stages as SchoolProfile["stages"]}
          stageYears={values.stageYears as SchoolProfile["stageYears"]}
          disabled={disabled}
          readOnly={platformManaged}
          onChange={(stages, years) => {
            setValue("stages", stages);
            setValue("stageYears", years);
          }}
        />
      )}
    </FormDialog>
  );
}
