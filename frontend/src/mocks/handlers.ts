import type { components } from "@kkaeddak/api-client";
import { http, HttpResponse } from "msw";

import type { ScenarioId } from "@/features/demo-session/model/scenarios";
import {
  createLocalPreparationSuggestions,
  createLocalTomorrowOverview,
} from "@/features/tomorrow/model/local-fixtures";

type DemoSessionCreate = components["schemas"]["DemoSessionCreate"];
type DemoSessionResponse = components["schemas"]["DemoSessionResponse"];
type PreparationSuggestionCreate =
  components["schemas"]["PreparationSuggestionCreate"];
type PreparationSuggestionsResponse =
  components["schemas"]["PreparationSuggestionsResponse"];
type PreparationTaskUpdate =
  components["schemas"]["PreparationTaskUpdate"];
type PreparationTaskResponse =
  components["schemas"]["PreparationTaskResponse"];
type HistorySummaryResponse = components["schemas"]["HistorySummaryResponse"];
type ProfileResponse = components["schemas"]["ProfileResponse"];
type RoutineProfileResponse = components["schemas"]["RoutineProfileResponse"];
type ScheduleEventsResponse = components["schemas"]["ScheduleEventsResponse"];
type WakePlanCreate = components["schemas"]["WakePlanCreate"];
type WakePlanDecisionUpdate =
  components["schemas"]["WakePlanDecisionUpdate"];
type WakePlanDecisionResponse =
  components["schemas"]["WakePlanDecisionResponse"];
type WakePlanDetail = components["schemas"]["WakePlanDetail"];
type WakePlanResponse = components["schemas"]["WakePlanResponse"];
type WakeOutcomeCreate = components["schemas"]["WakeOutcomeCreate"];

const sessions = new Map<string, ScenarioId>();
const preparationTasks = new Map<
  string,
  PreparationSuggestionsResponse["suggestions"][number]
>();
const wakePlans = new Map<string, WakePlanDetail>();
const wakePlanIdempotency = new Map<string, string>();
const wakeOutcomes = new Map<string, WakeOutcomeCreate>();

function getScenarioFromRequest(request: Request): ScenarioId {
  const sessionId = request.headers.get("X-Demo-Session");
  return (sessionId && sessions.get(sessionId)) || "exam-morning";
}

export const handlers = [
  http.post<never, DemoSessionCreate, DemoSessionResponse>(
    "/api/v1/demo-sessions",
    async ({ request }) => {
      const body = await request.json();
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, body.scenarioId as ScenarioId);

      return HttpResponse.json(
        {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          seeded: true,
          sessionId,
        },
        { status: 201 },
      );
    },
  ),
  http.get<never, never, RoutineProfileResponse>(
    "/api/v1/routines",
    ({ request }) => {
      const overview = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      );
      return HttpResponse.json(overview.routine);
    },
  ),
  http.get<never, never, ProfileResponse>(
    "/api/v1/profile",
    () =>
      HttpResponse.json({
        allowAggregateOutcomeSync: false,
        allowImportantEventDetection: true,
        automationMode: "RECOMMEND_ONLY",
        locale: "ko-KR",
        revision: 1,
        timezone: "Asia/Seoul",
        updatedAt: new Date().toISOString(),
      }),
  ),
  http.get<never, never, ScheduleEventsResponse>(
    "/api/v1/schedule-events",
    ({ request }) => {
      const overview = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      );
      return HttpResponse.json({
        items: overview.event ? [overview.event] : [],
        nextCursor: null,
      });
    },
  ),
  http.post<never, PreparationSuggestionCreate, PreparationSuggestionsResponse>(
    "/api/v1/preparation-suggestions",
    async ({ request }) => {
      await request.json();
      const overview = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      );
      const local = createLocalPreparationSuggestions(overview);
      const suggestions = local.suggestions.map((suggestion) => {
        const stored = preparationTasks.get(suggestion.id) ?? suggestion;
        preparationTasks.set(stored.id, stored);
        return stored;
      });
      return HttpResponse.json({
        suggestions,
        totalPotentialMinutes: local.totalPotentialMinutes,
      });
    },
  ),
  http.patch<
    { task_id: string },
    PreparationTaskUpdate,
    PreparationTaskResponse
  >(
    "/api/v1/preparation-tasks/:task_id",
    async ({ params, request }) => {
      const body = await request.json();
      const current = preparationTasks.get(params.task_id);
      const updated = {
        id: params.task_id,
        status: body.status,
        revision: (current?.revision ?? body.revision) + 1,
        updatedAt: new Date().toISOString(),
      };
      if (current) {
        preparationTasks.set(params.task_id, {
          ...current,
          status: updated.status,
          revision: updated.revision,
        });
      }
      return HttpResponse.json(updated);
    },
  ),
  http.post<never, WakePlanCreate, WakePlanResponse>(
    "/api/v1/wake-plans",
    async ({ request }) => {
      const body = await request.json();
      const idempotencyKey = request.headers.get("Idempotency-Key") ?? "";
      const existingId = wakePlanIdempotency.get(idempotencyKey);
      if (existingId) {
        const existing = wakePlans.get(existingId) as WakePlanDetail;
        return HttpResponse.json(
          {
            id: existing.id,
            revision: existing.revision,
            status: existing.status,
          },
          { status: 201 },
        );
      }

      const id = crypto.randomUUID();
      const detail: WakePlanDetail = {
        ...body,
        id,
        revision: 1,
        status: "PROPOSED",
      };
      wakePlans.set(id, detail);
      wakePlanIdempotency.set(idempotencyKey, id);
      return HttpResponse.json(
        { id, revision: 1, status: "PROPOSED" },
        { status: 201 },
      );
    },
  ),
  http.get<{ localDate: string }, never, WakePlanDetail>(
    "/api/v1/wake-plans/:localDate",
    ({ params }) => {
      const plan = Array.from(wakePlans.values()).find(
        (candidate) => candidate.localDate === params.localDate,
      );
      return plan
        ? HttpResponse.json(plan)
        : HttpResponse.json(
            {
              error: {
                code: "WAKE_PLAN_NOT_FOUND",
                message: "The wake plan was not found.",
                requestId: crypto.randomUUID(),
              },
            } as never,
            { status: 404 },
          );
    },
  ),
  http.patch<
    { plan_id: string },
    WakePlanDecisionUpdate,
    WakePlanDecisionResponse
  >(
    "/api/v1/wake-plans/:plan_id/decision",
    async ({ params, request }) => {
      const body = await request.json();
      const plan = wakePlans.get(params.plan_id);
      const status =
        body.decision === "APPROVE"
          ? ("APPROVED" as const)
          : body.decision === "EDIT"
            ? ("EDITED" as const)
            : ("DECLINED" as const);
      const revision = (plan?.revision ?? body.revision) + 1;
      if (plan) {
        wakePlans.set(params.plan_id, {
          ...plan,
          firstAlarmAt:
            body.changes?.firstAlarmAt ?? plan.firstAlarmAt,
          finalAlarmAt:
            body.changes?.finalAlarmAt ?? plan.finalAlarmAt,
          status,
          revision,
        });
      }
      return HttpResponse.json({ status, revision });
    },
  ),
  http.post<never, WakeOutcomeCreate, never>(
    "/api/v1/wake-outcomes",
    async ({ request }) => {
      const body = await request.json();
      wakeOutcomes.set(body.planId, body);
      return new HttpResponse(null, { status: 202 });
    },
  ),
  http.get<never, never, HistorySummaryResponse>(
    "/api/v1/history/summary",
    ({ request }) => {
      const url = new URL(request.url);
      const fromDate = url.searchParams.get("from") ?? "2026-01-01";
      const toDate = url.searchParams.get("to") ?? "2026-12-31";
      const outcomes = Array.from(wakeOutcomes.values());
      const onTimeSessions = outcomes.filter(
        (outcome) => outcome.outcome === "CONFIRMED_ON_TIME",
      ).length;
      const lateSessions = outcomes.filter(
        (outcome) => outcome.outcome === "CONFIRMED_LATE",
      ).length;
      return HttpResponse.json({
        averageAlarmSteps:
          outcomes.length > 0
            ? outcomes.reduce(
                (total, outcome) => total + outcome.alarmStepsUsed,
                0,
              ) / outcomes.length
            : null,
        fromDate,
        lateSessions,
        onTimeSessions,
        toDate,
        totalSessions: outcomes.length,
        unconfirmedSessions:
          outcomes.length - onTimeSessions - lateSessions,
      });
    },
  ),
];
