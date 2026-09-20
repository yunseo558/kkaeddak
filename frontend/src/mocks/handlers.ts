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
type ExplanationCreate = components["schemas"]["ExplanationCreate"];
type ExplanationResponse = components["schemas"]["ExplanationResponse"];
type ProfileResponse = components["schemas"]["ProfileResponse"];
type ProfileUpdate = components["schemas"]["ProfileUpdate"];
type RoutineProfileResponse = components["schemas"]["RoutineProfileResponse"];
type RoutineProfileUpdate = components["schemas"]["RoutineProfileUpdate"];
type ScheduleClassificationCreate =
  components["schemas"]["ScheduleClassificationCreate"];
type ScheduleClassificationResponse =
  components["schemas"]["ScheduleClassificationResponse"];
type PersonalizedWakePlanCreate =
  components["schemas"]["PersonalizedWakePlanCreate"];
type PersonalizedWakePlanResponse =
  components["schemas"]["PersonalizedWakePlanResponse"];
type ScheduleEventsBatchCreate =
  components["schemas"]["ScheduleEventsBatchCreate"];
type ScheduleEventsBatchResponse =
  components["schemas"]["ScheduleEventsBatchResponse"];
type ScheduleEventResponse = components["schemas"]["ScheduleEventResponse"];
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
const profiles = new Map<string, ProfileResponse>();
const routines = new Map<string, RoutineProfileResponse>();
const scheduleEvents = new Map<string, ScheduleEventResponse[]>();

export function upsertScheduleEvents(
  existing: ScheduleEventResponse[],
  incoming: ScheduleEventsBatchCreate["events"],
) {
  const merged = new Map(existing.map((event) => [event.clientId, event]));
  incoming.forEach((event) =>
    merged.set(event.clientId, { ...event, id: event.clientId }),
  );
  return Array.from(merged.values());
}

function getSessionId(request: Request) {
  return request.headers.get("X-Demo-Session") ?? "local";
}

function getScenarioFromRequest(request: Request): ScenarioId {
  const sessionId = request.headers.get("X-Demo-Session");
  return (sessionId && sessions.get(sessionId)) || "exam-morning";
}

function getProfileFromRequest(request: Request): ProfileResponse {
  const sessionId = getSessionId(request);
  const stored = profiles.get(sessionId);
  if (stored) {
    return stored;
  }
  const profile: ProfileResponse = {
    allowAggregateOutcomeSync: false,
    allowImportantEventDetection: true,
    automationMode: "RECOMMEND_ONLY",
    locale: "ko-KR",
    revision: 1,
    timezone: "Asia/Seoul",
    updatedAt: new Date().toISOString(),
  };
  profiles.set(sessionId, profile);
  return profile;
}

function getRoutineFromRequest(request: Request): RoutineProfileResponse {
  const sessionId = getSessionId(request);
  const stored = routines.get(sessionId);
  if (stored) return stored;
  const routine = createLocalTomorrowOverview(
    getScenarioFromRequest(request),
  ).routine;
  routines.set(sessionId, routine);
  return routine;
}

function classifyMockSchedule(
  body: ScheduleClassificationCreate,
): ScheduleClassificationResponse {
  const normalized = body.title.toLocaleLowerCase("ko-KR");
  const keywordGroups: Array<[string, string[]]> = [
    ["IMPORTANT", ["시험", "고사", "면접", "발표", "경진대회"]],
    ["CLASS", ["수업", "강의", "세미나"]],
    ["WORK", ["회의", "업무", "출근", "미팅"]],
    ["APPOINTMENT", ["약속", "예약", "브런치"]],
    ["EXERCISE", ["운동", "헬스", "pt", "필라테스"]],
  ];
  const matchedCode = keywordGroups.find(([, keywords]) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  )?.[0];
  const matched = body.categories.find((item) => item.code === matchedCode);
  const fallback = body.categories.find((item) => item.isFallback);
  const selected = matched ?? fallback ?? body.categories[0];

  return {
    categoryCode: selected?.code ?? "OTHER",
    confidence: matched ? 0.92 : 0.45,
    source: "TEMPLATE",
  };
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
    ({ request }) => HttpResponse.json(getRoutineFromRequest(request)),
  ),
  http.put<never, RoutineProfileUpdate, RoutineProfileResponse>(
    "/api/v1/routines",
    async ({ request }) => {
      const body = await request.json();
      const sessionId = getSessionId(request);
      const updated: RoutineProfileResponse = {
        ...body,
        revision: body.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      routines.set(sessionId, updated);
      return HttpResponse.json(updated);
    },
  ),
  http.get<never, never, ProfileResponse>(
    "/api/v1/profile",
    ({ request }) => HttpResponse.json(getProfileFromRequest(request)),
  ),
  http.put<never, ProfileUpdate, ProfileResponse>(
    "/api/v1/profile",
    async ({ request }) => {
      const body = await request.json();
      const sessionId = request.headers.get("X-Demo-Session") ?? "local";
      const updated: ProfileResponse = {
        ...body,
        revision: body.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      profiles.set(sessionId, updated);
      return HttpResponse.json(updated);
    },
  ),
  http.get<never, never, ScheduleEventsResponse>(
    "/api/v1/schedule-events",
    ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const stored = scheduleEvents.get(getSessionId(request));
      const seeded = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      ).event;
      const items = stored ?? (seeded ? [{ ...seeded, id: seeded.clientId }] : []);
      return HttpResponse.json({
        items: items.filter(
          (item) =>
            (!from || item.startsAt >= from) && (!to || item.startsAt < to),
        ),
        nextCursor: null,
      });
    },
  ),
  http.post<never, ScheduleEventsBatchCreate, ScheduleEventsBatchResponse>(
    "/api/v1/schedule-events:batch",
    async ({ request }) => {
      const body = await request.json();
      const sessionId = getSessionId(request);
      scheduleEvents.set(
        sessionId,
        upsertScheduleEvents(scheduleEvents.get(sessionId) ?? [], body.events),
      );
      return HttpResponse.json(
        { accepted: body.events.length, rejected: [] },
        { status: 201 },
      );
    },
  ),
  http.post<
    never,
    ScheduleClassificationCreate,
    ScheduleClassificationResponse
  >(
    "/api/v1/ai/schedule-classifications",
    async ({ request }) =>
      HttpResponse.json(classifyMockSchedule(await request.json())),
  ),
  http.post<never, ExplanationCreate, ExplanationResponse>(
    "/api/v1/ai/explanations",
    async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json({
        explanation: body.planChangeSummary,
        source: "TEMPLATE",
      });
    },
  ),
  http.post<never, PersonalizedWakePlanCreate, PersonalizedWakePlanResponse>(
    "/api/v1/ai/wake-plan-recommendations",
    async ({ request }) => {
      const body = await request.json();
      const shortfall = Math.max(
        0,
        (body.usualRestMinutes ?? 420) - (body.restMinutes ?? 420),
      );
      const failures = body.recentLateCount + body.recentMissedCount;
      const fatigueScore = Math.min(
        100,
        24 + Math.round(shortfall / 3) + failures * 14,
      );
      const fatigueLevel =
        fatigueScore >= 65 ? "HIGH" : fatigueScore >= 35 ? "MEDIUM" : "LOW";
      const alarmCount = Math.min(
        4,
        Math.max(
          body.preferredAlarmCount,
          fatigueLevel === "HIGH" ? 3 : fatigueLevel === "MEDIUM" ? 2 : 1,
        ),
      );
      return HttpResponse.json({
        fatigueScore,
        fatigueLevel,
        alarmOffsetsMin: Array.from(
          { length: alarmCount },
          (_, index) => index * body.preferredIntervalMin,
        ),
        reasonCodes: [
          shortfall > 30
            ? "SHORTER_REST_THAN_BASELINE"
            : "STABLE_WAKE_PATTERN",
          failures ? "RECENT_WAKE_FAILURE" : "USER_ALARM_PREFERENCE",
        ],
        explanation:
          fatigueLevel === "HIGH"
            ? "수면 부족과 최근 기상 반응을 반영해 첫 알람을 앞당겼어요."
            : "최근 수면과 기상 반응에 맞춰 필요한 알람만 배치했어요.",
        confidence: body.learningDays >= 14 ? 0.88 : 0.72,
        requiresReview:
          body.learningDays < 14 ||
          fatigueLevel === "HIGH" ||
          body.importance !== "NORMAL",
        source: "MODEL",
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
