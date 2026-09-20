"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { MockProvider } from "@/mocks/mock-provider";
import { GlobalAlarmScheduler } from "@/features/service/components/global-alarm-scheduler";
import {
  apiRetryDelay,
  shouldRetryApiRequest,
} from "@/lib/api/api-recovery";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: "always",
            retry: shouldRetryApiRequest,
            retryDelay: apiRetryDelay,
            staleTime: 30_000,
          },
          mutations: {
            networkMode: "always",
            retry: 0,
          },
        },
      }),
  );

  return (
    <MockProvider>
      <QueryClientProvider client={queryClient}>
        <GlobalAlarmScheduler />
        {children}
      </QueryClientProvider>
    </MockProvider>
  );
}
