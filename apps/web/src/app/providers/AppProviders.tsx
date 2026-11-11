import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { BrowserRouter } from "react-router";
import { ApiError, SessionChangedError } from "../../shared/api/api-error";
import { useTheme } from "../../shared/hooks/use-theme";
import { ApiEffects } from "./ApiEffects";
import { SessionBootstrap } from "./session-bootstrap/SessionBootstrap";

type AppProvidersProps = { children: ReactNode };

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) =>
              !(error instanceof SessionChangedError) &&
              !(error instanceof ApiError && error.status < 500) &&
              count < 2,
          },
          mutations: { retry: false },
        },
      }),
  );
  useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ApiEffects />
        <SessionBootstrap>{children}</SessionBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
