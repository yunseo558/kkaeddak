"use client";

import type { components } from "@kkaeddak/api-client";
import { useQuery } from "@tanstack/react-query";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { localDataStore } from "@/lib/storage/local-data";

import {
  getWakeHistorySummary,
  hasServerOutcomeConsent,
} from "../api/wake-outcome-api";

type HistorySummary = components["schemas"]["HistorySummaryResponse"];

const KOREA_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

function koreanDate(value: Date) {
  return new Date(value.getTime() + KOREA_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

export function createHistoryWindow(reference = new Date()) {
  return {
    from: koreanDate(new Date(reference.getTime() - 29 * 24 * 60 * 60 * 1_000)),
    to: koreanDate(reference),
  };
}

export async function getLocalWakeHistory(
  from: string,
  to: string,
): Promise<HistorySummary> {
  const events = await localDataStore.getAll("wake-events");
  const outcomes = events.filter(
    (event) =>
      event.eventType === "OUTCOME_RECORDED" &&
      event.localDate !== undefined &&
      event.localDate >= from &&
      event.localDate <= to &&
      event.outcome !== undefined,
  );
  const onTimeSessions = outcomes.filter(
    (event) => event.outcome === "CONFIRMED_ON_TIME",
  ).length;
  const lateSessions = outcomes.filter(
    (event) => event.outcome === "CONFIRMED_LATE",
  ).length;
  const alarmSteps = outcomes
    .map((event) => event.alarmStepsUsed)
    .filter((value): value is number => value !== undefined);

  return {
    fromDate: from,
    toDate: to,
    totalSessions: outcomes.length,
    onTimeSessions,
    lateSessions,
    unconfirmedSessions: outcomes.length - onTimeSessions - lateSessions,
    averageAlarmSteps:
      alarmSteps.length > 0
        ? alarmSteps.reduce((total, value) => total + value, 0) /
          alarmSteps.length
        : null,
  };
}

export function useWakeHistory() {
  const mode = useDemoSessionStore((state) => state.mode);
  const sessionId = useDemoSessionStore((state) => state.sessionId);
  const outcomeSync = useCurrentFlowStore(
    (state) => state.onboardingDraft.outcomeSync,
  );
  const window = createHistoryWindow();
  const requestsServer = Boolean(mode === "server" && sessionId && outcomeSync);
  const query = useQuery({
    queryKey: ["wake-history", requestsServer, sessionId, window.from, window.to],
    queryFn: async () => {
      if (requestsServer && sessionId) {
        try {
          if (await hasServerOutcomeConsent(sessionId)) {
            return {
              source: "server" as const,
              summary: await getWakeHistorySummary(
                sessionId,
                window.from,
                window.to,
              ),
            };
          }
        } catch {
          // Local history remains available when optional aggregate sync is unavailable.
        }
      }
      return {
        source: "local" as const,
        summary: await getLocalWakeHistory(window.from, window.to),
      };
    },
  });

  return { query, window };
}
