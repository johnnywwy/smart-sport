import {
  identityListSchema,
  selectIdentityRequestSchema,
  selectIdentityResponseSchema,
} from "@smart-sport/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { apiClient } from "../api/client";
import { useApiEvents } from "../stores/api-events";
import { useSession } from "../stores/session";

export function useIdentities() {
  const generation = useSession((state) => state.generation);
  return useQuery({
    queryKey: ["account", generation, "identities"],
    queryFn: () =>
      apiClient.request("/api/v1/auth/identities", identityListSchema),
  });
}

export function useSelectIdentity() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (identityId: string) =>
      apiClient.request(
        "/api/v1/auth/select-identity",
        selectIdentityResponseSchema,
        {
          method: "POST",
          body: selectIdentityRequestSchema.parse({ identityId }),
        },
      ),
    onSuccess: ({ accessToken, identity }) => {
      useSession.getState().selectIdentity(accessToken, identity);
      useApiEvents
        .getState()
        .notifySuccess(`正在进入${identity.orgName}`, "身份已切换");
      navigate("/modules", { replace: true });
    },
  });
}
