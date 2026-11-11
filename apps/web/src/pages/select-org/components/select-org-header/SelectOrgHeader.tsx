import { Avatar, Button } from "@heroui/react";

type SelectOrgHeaderProps = {
  pending: boolean;
  onSignOut: () => void;
};

export function SelectOrgHeader({ pending, onSignOut }: SelectOrgHeaderProps) {
  return (
    <header className="select-org-header">
      <div className="flex items-center gap-3">
        <span className="select-org-logo">体</span>
        <span className="text-[15px] font-semibold text-[#18181b]">
          智慧体育云平台
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button
          className="h-9 rounded-full bg-[#ebebec] px-4 text-sm text-[#18181b]"
          variant="secondary"
          isDisabled={pending}
          onPress={onSignOut}
        >
          {pending ? "正在退出…" : "退出登录"}
        </Button>
        <Avatar className="h-9 w-9 bg-[#18181b] text-white" size="sm">
          <Avatar.Fallback>管</Avatar.Fallback>
        </Avatar>
      </div>
    </header>
  );
}
