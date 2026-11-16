import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { SessionChangedError } from "../../../../shared/errors/api-error";
import { schoolMenuPermissions } from "../../../../shared/hooks/school-navigation";
import { findMenuSchool } from "../../../../shared/hooks/use-menu-schools";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { useSchool } from "../../../../shared/stores/school";
import { useSession } from "../../../../shared/stores/session";
import type { SchoolChoice } from "../../../../shared/types/school";

export function useEnterSchool(path: string | undefined) {
  const navigate = useNavigate();
  const controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  return useMutation({
    mutationFn: async (school: SchoolChoice) => {
      const generation = useSession.getState().generation;
      const permission = schoolMenuPermissions("classes");
      if (!path || !permission.length)
        throw new Error("当前身份没有班级管理访问权限");
      const found = await findMenuSchool(
        school,
        permission,
        controller.current.signal,
      );
      if (generation !== useSession.getState().generation) return;
      if (!found)
        throw new Error("当前学校不在你的班级管理范围内，请选择其他学校");
      useSchool.getState().select(found);
      navigate(path);
    },
    onError: (error) => {
      if (
        !controller.current.signal.aborted &&
        !(error instanceof SessionChangedError)
      )
        useApiEvents.getState().notifyError(error.message);
    },
  });
}
