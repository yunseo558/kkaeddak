import {
  demoSessionHeaders,
  type components,
} from "@kkaeddak/api-client";

import type { WakeResult } from "@/features/current-flow/model/current-flow-store";
import { apiClient } from "@/lib/api/client";
import { pickAllowedApiPayload } from "@/lib/privacy/api-payload";

type HistorySummaryResponse = components["schemas"]["HistorySummaryResponse"];
type WakeOutcomeCreate = components["schemas"]["WakeOutcomeCreate"];

export class WakeOutcomeRequestError extends Error {
  constructor(
    readonly operation: "consent" | "history" | "outcome",
    readonly status: number,
  ) {
    super(`${operation} request failed with status ${status}`);
    this.name = "WakeOutcomeRequestError";
  }
}

export function createWakeOutcomePayload(
  result: WakeResult,
): WakeOutcomeCreate {
  return pickAllowedApiPayload(
    {
      alarmStepsUsed: result.alarmStepsUsed,
      confirmedAt: result.confirmedAt,
      consentVersion: "frontend-v1",
      outcome: result.outcome,
      planId: result.planId,
      userCorrection: result.userCorrection,
    },
    [
      "alarmStepsUsed",
      "confirmedAt",
      "consentVersion",
      "outcome",
      "planId",
      "userCorrection",
    ],
  );
}

export function createWakeOutcomeIdempotencyKey(result: WakeResult) {
  return ["wake-outcome", result.planId, result.completedAt].join(":");
}

export async function hasServerOutcomeConsent(sessionId: string) {
  const { data, error, response } = await apiClient.GET("/api/v1/profile", {
    headers: demoSessionHeaders(sessionId),
  });
  if (!data || error) {
    throw new WakeOutcomeRequestError("consent", response.status);
  }
  return data.allowAggregateOutcomeSync;
}

export async function syncWakeOutcome(
  sessionId: string,
  result: WakeResult,
) {
  const consented = await hasServerOutcomeConsent(sessionId);
  if (!consented) {
    return { synced: false as const };
  }

  const response = await apiClient.POST("/api/v1/wake-outcomes", {
    params: {
      header: {
        ...demoSessionHeaders(sessionId),
        "Idempotency-Key": createWakeOutcomeIdempotencyKey(result),
      },
    },
    body: createWakeOutcomePayload(result),
  });

  if (!response.response.ok || response.error) {
    throw new WakeOutcomeRequestError("outcome", response.response.status);
  }
  return { synced: true as const };
}

export async function getWakeHistorySummary(
  sessionId: string,
  from: string,
  to: string,
): Promise<HistorySummaryResponse> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/history/summary",
    {
      headers: demoSessionHeaders(sessionId),
      params: { query: { from, to } },
    },
  );

  if (!data || error) {
    throw new WakeOutcomeRequestError("history", response.status);
  }
  return data;
}
