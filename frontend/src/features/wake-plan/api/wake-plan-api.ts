import {
  demoSessionHeaders,
  type components,
} from "@kkaeddak/api-client";

import { apiClient } from "@/lib/api/client";
import { pickAllowedApiPayload } from "@/lib/privacy/api-payload";

type WakePlanCreate = components["schemas"]["WakePlanCreate"];
type WakePlanResponse = components["schemas"]["WakePlanResponse"];
type WakePlanDecisionUpdate =
  components["schemas"]["WakePlanDecisionUpdate"];
type WakePlanDecisionResponse =
  components["schemas"]["WakePlanDecisionResponse"];

export class WakePlanRequestError extends Error {
  constructor(
    readonly operation: "create" | "decision",
    readonly status: number,
  ) {
    super(`${operation} wake plan request failed with status ${status}`);
    this.name = "WakePlanRequestError";
  }
}

export function createWakePlanPayload(plan: WakePlanCreate): WakePlanCreate {
  const steps = plan.steps.map((step) =>
    pickAllowedApiPayload(step, ["order", "offsetMin", "channel"]),
  );
  return pickAllowedApiPayload({ ...plan, steps }, [
    "localDate",
    "timezone",
    "deadlineAt",
    "firstAlarmAt",
    "finalAlarmAt",
    "importance",
    "protocolLevel",
    "steps",
    "reasonCodes",
    "requiresApproval",
    "modelVersion",
  ]);
}

export function createWakePlanIdempotencyKey(plan: WakePlanCreate): string {
  return [
    "wake-plan",
    plan.localDate,
    new Date(plan.firstAlarmAt).getTime(),
    plan.protocolLevel,
  ].join(":");
}

export function createWakePlanDecisionPayload(
  decision: WakePlanDecisionUpdate["decision"],
  revision: number,
  changes?: WakePlanDecisionUpdate["changes"],
): WakePlanDecisionUpdate {
  const source = changes
    ? {
        decision,
        revision,
        changes: pickAllowedApiPayload(changes, [
          "firstAlarmAt",
          "finalAlarmAt",
        ]),
      }
    : { decision, revision };
  return pickAllowedApiPayload(source, Object.keys(source) as Array<keyof typeof source>);
}

export async function createWakePlan(
  sessionId: string,
  plan: WakePlanCreate,
  idempotencyKey: string,
): Promise<WakePlanResponse> {
  const { data, error, response } = await apiClient.POST("/api/v1/wake-plans", {
    params: {
      header: {
        ...demoSessionHeaders(sessionId),
        "Idempotency-Key": idempotencyKey,
      },
    },
    body: createWakePlanPayload(plan),
  });

  if (!data || error) {
    throw new WakePlanRequestError("create", response.status);
  }
  return data;
}

export async function updateWakePlanDecision(
  sessionId: string,
  planId: string,
  payload: WakePlanDecisionUpdate,
): Promise<WakePlanDecisionResponse> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/wake-plans/{plan_id}/decision",
    {
      headers: demoSessionHeaders(sessionId),
      params: { path: { plan_id: planId } },
      body: payload,
    },
  );

  if (!data || error) {
    throw new WakePlanRequestError("decision", response.status);
  }
  return data;
}
