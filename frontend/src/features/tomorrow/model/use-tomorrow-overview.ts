"use client";

import { useQuery } from "@tanstack/react-query";

import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { getTomorrowOverview } from "../api/tomorrow-api";
import { createLocalTomorrowOverview } from "./local-fixtures";

export const tomorrowOverviewQueryKey = (
  mode: string | null,
  sessionId: string | null,
  scenarioId: string | null,
) => ["tomorrow-overview", mode, sessionId, scenarioId] as const;

export function useTomorrowOverview() {
  const mode = useDemoSessionStore((state) => state.mode);
  const scenarioId = useDemoSessionStore((state) => state.scenarioId);
  const sessionId = useDemoSessionStore((state) => state.sessionId);
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

  return { mode, query, ready, scenarioId, sessionId };
}
