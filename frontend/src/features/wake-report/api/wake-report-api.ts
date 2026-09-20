import {
  demoSessionHeaders,
  type components,
} from "@kkaeddak/api-client";

import { apiClient } from "@/lib/api/client";

export type AlarmEventType = components["schemas"]["AlarmEventType"];
export type HistoryReportDetail = components["schemas"]["HistoryReportDetail"];
export type HistoryReportListItem = components["schemas"]["HistoryReportListItem"];
export type WakeAlarmEventCreate = components["schemas"]["WakeAlarmEventCreate"];
export type WakeLearningEffect = components["schemas"]["WakeLearningEffect"];
export type WakePlanReportContext = components["schemas"]["WakePlanReportContext"];

export class WakeReportRequestError extends Error {
  constructor(
    readonly operation:
      | "alarm-event"
      | "detail"
      | "learning-effect"
      | "list"
      | "report-context",
    readonly status: number,
  ) {
    super(`${operation} request failed with status ${status}`);
    this.name = "WakeReportRequestError";
  }
}

export function createAlarmEventPayload(
  stepOrder: number,
  eventType: AlarmEventType,
  occurredAt: string,
): WakeAlarmEventCreate {
  return { stepOrder, eventType, occurredAt };
}

export async function postAlarmEvent(
  sessionId: string,
  planId: string,
  payload: WakeAlarmEventCreate,
) {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/wake-plans/{plan_id}/alarm-events",
    {
      headers: demoSessionHeaders(sessionId),
      params: { path: { plan_id: planId } },
      body: payload,
    },
  );
  if (!data || error) {
    throw new WakeReportRequestError("alarm-event", response.status);
  }
  return data;
}

export async function putWakePlanReportContext(
  sessionId: string,
  planId: string,
  payload: WakePlanReportContext,
) {
  const { data, error, response } = await apiClient.PUT(
    "/api/v1/wake-plans/{plan_id}/report-context",
    {
      headers: demoSessionHeaders(sessionId),
      params: { path: { plan_id: planId } },
      body: payload,
    },
  );
  if (!data || error) {
    throw new WakeReportRequestError("report-context", response.status);
  }
  return data;
}

export async function putWakeLearningEffect(
  sessionId: string,
  planId: string,
  payload: WakeLearningEffect,
) {
  const { data, error, response } = await apiClient.PUT(
    "/api/v1/wake-plans/{plan_id}/learning-effect",
    {
      headers: demoSessionHeaders(sessionId),
      params: { path: { plan_id: planId } },
      body: payload,
    },
  );
  if (!data || error) {
    throw new WakeReportRequestError("learning-effect", response.status);
  }
  return data;
}

export async function listWakeHistoryReports(
  sessionId: string,
  from: string,
  to: string,
) {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/history/reports",
    {
      headers: demoSessionHeaders(sessionId),
      params: { query: { from, to } },
    },
  );
  if (!data || error) {
    throw new WakeReportRequestError("list", response.status);
  }
  return data;
}

export async function getWakeHistoryReport(
  sessionId: string,
  localDate: string,
) {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/history/reports/{localDate}",
    {
      headers: demoSessionHeaders(sessionId),
      params: { path: { localDate } },
    },
  );
  if (!data || error) {
    throw new WakeReportRequestError("detail", response.status);
  }
  return data;
}
