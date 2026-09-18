"use client";

import { useQuery } from "@tanstack/react-query";

import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { useOnlineStatus } from "@/lib/network/use-online-status";

import { getTomorrowOverview } from "../api/tomorrow-api";
import { createLocalTomorrowOverview } from "./local-fixtures";

export const tomorrowOverviewQueryKey = (
  mode: string | null,
  sessionId: string | null,
  scenarioId: string | null,
) => ["tomorrow-overview", mode, sessionId, scenarioId] as const;

export function useTomorrowOverview() {
  const storedMode = useDemoSessionStore((state) => state.mode);
  const scenarioId = useDemoSessionStore((state) => state.scenarioId);
  const sessionId = useDemoSessionStore((state) => state.sessionId);
  const online = useOnlineStatus();
  const offlineFallback = storedMode === "server" && !online;
  const mode = offlineFallback ? "local" : storedMode;
  const ready = Boolean(mode && scenarioId && (mode === "local" || sessionId));

  const query = useQuery({
    queryKey: tomorrowOverviewQueryKey(mode, sessionId, scenarioId),
    enabled: ready,
    queryFn: () => {
      if (!scenarioId) {
        throw new Error("A demo scenario is required");
      }
      if (mode === "local") {
        return Promise.resolve(createLocalTomorrowOverview(scenarioId));
      }
      if (!sessionId) {
        throw new Error("A demo session is required");
      }
      return getTomorrowOverview(sessionId);
    },
  });

  return { mode, offlineFallback, query, ready, scenarioId, sessionId };
}
