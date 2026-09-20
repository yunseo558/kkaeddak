import { demoSessionHeaders } from "@kkaeddak/api-client";
import { apiClient } from "@/lib/api/client";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { createDemoSession } from "@/features/demo-session/api/create-demo-session";
import {
  isDemoSessionExpired,
  useDemoSessionStore,
} from "@/features/demo-session/model/demo-session-store";
import { calculateWakeRecommendation } from "@/features/wake-plan/lib/recommendation-engine";
import {
  createWakePlan,
  updateWakePlanDecision,
} from "@/features/wake-plan/api/wake-plan-api";
import { applyWakeLearning } from "@/features/wake-result/lib/wake-learning";
import { syncWakeOutcome } from "@/features/wake-result/api/wake-outcome-api";
import {
  postAlarmEvent,
  putWakeLearningEffect,
  putWakePlanReportContext,
  type AlarmEventType,
  type WakeLearningEffect,
} from "@/features/wake-report/api/wake-report-api";
import {
  saveLocalAlarmEvent,
  saveLocalLearningEffect,
  saveLocalReportContext,
  saveLocalWakeOutcome,
  updateLocalReportPlan,
} from "@/features/wake-report/lib/local-wake-reports";
import { createWakePlanReportContext } from "@/features/wake-report/lib/report-context";
import { localDataStore } from "@/lib/storage/local-data";
import { getApiStatus } from "@/lib/api/api-recovery";
import {
  useServiceStore,
  type CalendarEntry,
  type ScheduleClassification,
  type ScheduleTypeRule,
  type ServicePlan,
} from "../model/service-store";
import {
  addDays,
  alarmEditValidationMessage,
  atTime,
  automationEligibility,
  localDate,
  mergeAlarmOffsetsWithSafety,
  shiftAlarmSchedule,
} from "../model/service-policy";
import { startAlarmSound, stopAlarmSound } from "./alarm-audio";
import {
  alarmEventKey,
  alarmScheduledAt,
  completeAlarmStep,
  emptyAlarmRuntime,
  nextAlarmStep,
  queueAlarmEvent,
  remainingAlarmStepOrders,
} from "./alarm-sequence";
import {
  createMockCalendar,
  healthKitDemoSource,
} from "./mock-integrations";

export const serviceNow = () =>
  useServiceStore.getState().virtualNow ?? new Date().toISOString();

export class ServiceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ServiceRequestError";
  }
}

function requestFailed(message: string, status: number): never {
  throw new ServiceRequestError(message, status);
}

function sessionId() {
  const id = useDemoSessionStore.getState().sessionId;
  if (!id)
    throw new Error("연결된 계정이 없습니다. 캘린더 연결부터 완료해 주세요.");
  return id;
}

let sessionRecoveryPromise: Promise<void> | null = null;

async function restoreLocalStateToNewSession() {
  const store = useServiceStore.getState();
  const flow = useCurrentFlowStore.getState();
  const calendarWasConnected = store.calendarConnected;
  const localEvents = [...store.events];

  store.set({
    alarmStage: "idle",
    alarmRuntime: emptyAlarmRuntime(),
    lastAutomationSlot: null,
    plan: null,
  });
  flow.setActiveWakePlan(null);
  flow.setEditingPlanId(null);
  flow.setWakeResult(null);

  await saveServicePreferences();
  await saveServiceProfile();

  if (!calendarWasConnected) return;
  const events = localEvents.length
    ? localEvents
    : createMockCalendar(localDate(serviceNow()));
  await saveCalendarEvents(events);
  store.set({ calendarConnected: true, events });
  await generateServicePlan();
}

export async function recoverDemoSession() {
  sessionRecoveryPromise ??= (async () => {
    const previous = useDemoSessionStore.getState();
    const scenarioId = previous.scenarioId ?? "regular-class";
    const session = await createDemoSession(scenarioId);
    useDemoSessionStore.getState().startServer({
      expiresAt: session.expiresAt,
      scenarioId,
      sessionId: session.sessionId,
    });
    await restoreLocalStateToNewSession();
    useServiceStore.getState().set({ message: "데모 연결을 복구했어요" });
  })().finally(() => {
    sessionRecoveryPromise = null;
  });
  return sessionRecoveryPromise;
}

export async function ensureFreshDemoSession() {
  if (!isDemoSessionExpired(useDemoSessionStore.getState())) return false;
  await recoverDemoSession();
  return true;
}

// Mutations are serialized across the phone UI and its presentation controls.
export async function serviceAction(action: () => Promise<void>) {
  const store = useServiceStore.getState();
  if (store.busy) return false;
  store.set({ busy: true, message: null });
  try {
    const recovered = await ensureFreshDemoSession();
    try {
      await action();
    } catch (error) {
      if (recovered || getApiStatus(error) !== 401) throw error;
      await recoverDemoSession();
      await action();
    }
    return true;
  } catch (error) {
    const status = getApiStatus(error);
    store.set({
      message:
        status === 401
          ? "데모 연결을 복구하지 못했어요. 잠시 후 다시 시도해 주세요."
          : status === 409
            ? "다른 변경과 겹쳤어요. 캘린더에서 계획을 다시 계산해 주세요."
            : error instanceof Error && !status
              ? error.message
              : "저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
    });
    return false;
  } finally {
    store.set({ busy: false });
  }
}

export async function saveServiceProfile() {
  const headers = demoSessionHeaders(sessionId());
  const profile = await apiClient.GET("/api/v1/profile", { headers });
  if (!profile.data || profile.error)
    requestFailed("프로필 설정을 불러오지 못했어요.", profile.response.status);
  const survey = useCurrentFlowStore.getState().onboardingDraft;
  const saved = await apiClient.PUT("/api/v1/profile", {
    headers,
    body: {
      timezone: "Asia/Seoul",
      locale: "ko-KR",
      revision: profile.data.revision,
      automationMode:
        survey.automationMode === "automatic"
          ? "AUTO_ROUTINE_DAYS"
          : "RECOMMEND_ONLY",
      allowImportantEventDetection: true,
      allowAggregateOutcomeSync: survey.outcomeSync,
    },
  });
  if (!saved.data || saved.error)
    requestFailed("프로필 설정을 저장하지 못했어요.", saved.response.status);
}

export async function saveCalendarEvents(events: CalendarEntry[]) {
  const result = await apiClient.POST("/api/v1/schedule-events:batch", {
    headers: demoSessionHeaders(sessionId()),
    body: { events },
  });
  if (!result.data || result.error || result.data.rejected.length)
    requestFailed(
      "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      result.response.status,
    );
}

export async function classifyScheduleTitle(
  title: string,
  scheduleTypes: ScheduleTypeRule[] = useServiceStore.getState().scheduleTypes,
): Promise<ScheduleClassification> {
  const result = await apiClient.POST("/api/v1/ai/schedule-classifications", {
    headers: demoSessionHeaders(sessionId()),
    body: {
      title,
      categories: scheduleTypes.map(({ code, label, isFallback }) => ({
        code,
        label,
        isFallback,
      })),
    },
  });
  if (!result.data || result.error)
    requestFailed(
      "일정 유형을 판단하지 못했어요. 직접 유형을 선택해 주세요.",
      result.response.status,
    );
  return result.data;
}

async function explainServicePlan(reasonCodes: string[], summary: string) {
  try {
    const result = await apiClient.POST("/api/v1/ai/explanations", {
      headers: demoSessionHeaders(sessionId()),
      body: {
        reasonCodes: reasonCodes.length ? reasonCodes : ["LIMITED_HISTORY"],
        planChangeSummary: summary.slice(0, 300),
      },
    });
    if (result.data && !result.error) return result.data;
    if (result.response.status === 401)
      requestFailed("AI 설명 연결이 만료됐어요.", result.response.status);
  } catch (error) {
    if (getApiStatus(error) === 401) throw error;
    // Explanations are optional; plan creation must keep working offline.
  }
  return { explanation: summary, source: "TEMPLATE" as const };
}

async function personalizeWakePlan(input: {
  category: string;
  importance: "NORMAL" | "IMPORTANT" | "CRITICAL";
  eventHour: number;
  baseWakeLeadMin: number;
  restMinutes: number | null;
  activityLevel: "low" | "moderate" | "high" | null;
  conditionLevel: "low" | "normal" | "high" | null;
  recentOnTimeCount: number;
  recentLateCount: number;
  recentMissedCount: number;
  recentAverageAlarmSteps: number;
  learningDays: number;
  preferredAlarmCount: number;
  preferredIntervalMin: number;
  keepSafetyAlarm: boolean;
}) {
  const result = await apiClient.POST(
    "/api/v1/ai/wake-plan-recommendations",
    {
      headers: demoSessionHeaders(sessionId()),
      body: {
        ...input,
        usualRestMinutes: 420,
      },
    },
  );
  if (!result.data || result.error)
    requestFailed(
      "AI 개인화 계획을 계산하지 못했어요.",
      result.response.status,
    );
  return result.data;
}

async function classifyCalendarEvents(events: CalendarEntry[]) {
  const classifications: Record<string, ScheduleClassification> = {};
  const titles = [...new Set(events.map((event) => event.displayTitle ?? "일정"))];
  const scheduleTypes = useServiceStore.getState().scheduleTypes;
  const result = await apiClient.POST(
    "/api/v1/ai/schedule-classifications:batch",
    {
      headers: demoSessionHeaders(sessionId()),
      body: {
        titles,
        categories: scheduleTypes.map(({ code, label, isFallback }) => ({
          code,
          label,
          isFallback,
        })),
      },
    },
  );
  if (!result.data || result.error)
    requestFailed(
      "캘린더 일정을 AI로 분류하지 못했어요.",
      result.response.status,
    );
  const byTitle = new Map(
    result.data.items.map((item) => [
      item.title,
      {
        categoryCode: item.categoryCode,
        confidence: item.confidence,
        source: item.source,
      } satisfies ScheduleClassification,
    ]),
  );
  for (const event of events) {
    const classification = byTitle.get(event.displayTitle ?? "일정");
    if (!classification) throw new Error("일정 유형을 판단하지 못했어요.");
    classifications[event.clientId] = classification;
  }
  return {
    events: events.map((event) => ({
      ...event,
      category: classifications[event.clientId].categoryCode,
    })),
    classifications,
  };
}

export async function reclassifyCalendarWithAi() {
  const store = useServiceStore.getState();
  if (!store.calendarConnected || !store.events.length) return;
  const classified = await classifyCalendarEvents(store.events);
  await saveCalendarEvents(classified.events);
  store.set(classified);
}

export async function saveServicePreferences() {
  const store = useServiceStore.getState();
  const headers = demoSessionHeaders(sessionId());
  const routine = await apiClient.GET("/api/v1/routines", { headers });
  if (!routine.data || routine.error)
    requestFailed("알람 설정을 불러오지 못했어요.", routine.response.status);
  const saved = await apiClient.PUT("/api/v1/routines", {
    headers,
    body: {
      revision: routine.data.revision,
      wakeBufferMin: 0,
      routineTasks: [],
      alarmPreferences: {
        preferredFirstChannel: "PHONE_SOUND",
        maxProtocolLevel: 3,
        preferredAlarmCount: store.preferredAlarmCount,
        alarmIntervalMin: store.alarmIntervalMinutes,
        keepSafetyAlarm: store.keepSafetyAlarm,
        automationTime: store.automationTime,
        scheduleTypes: store.scheduleTypes,
      },
    },
  });
  if (!saved.data || saved.error)
    requestFailed("알람 설정을 저장하지 못했어요.", saved.response.status);
}

export async function connectCalendar(forceRefresh = false) {
  const store = useServiceStore.getState();
  let id = useDemoSessionStore.getState().sessionId;
  const expires = useDemoSessionStore.getState().expiresAt;
  if (forceRefresh || !id || !expires || Date.parse(expires) <= Date.now()) {
    const scenarioId =
      useDemoSessionStore.getState().scenarioId ?? "regular-class";
    const session = await createDemoSession(scenarioId);
    useDemoSessionStore.getState().startServer({
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      scenarioId,
    });
    id = session.sessionId;
    store.set({ plan: null });
  }
  const headers = demoSessionHeaders(id);
  const [routine, profile] = await Promise.all([
    apiClient.GET("/api/v1/routines", { headers }),
    apiClient.GET("/api/v1/profile", { headers }),
  ]);
  if (!routine.data || !profile.data)
    requestFailed(
      "설정을 불러오지 못했어요. 다시 연결해 주세요.",
      !routine.data ? routine.response.status : profile.response.status,
    );
  const survey = useCurrentFlowStore.getState().onboardingDraft;
  const savedRoutine = await apiClient.PUT("/api/v1/routines", {
    headers,
    body: {
      revision: routine.data.revision,
      wakeBufferMin: 0,
      routineTasks: [],
      alarmPreferences: {
        preferredFirstChannel: "PHONE_SOUND",
        maxProtocolLevel: 3,
        preferredAlarmCount: store.preferredAlarmCount,
        alarmIntervalMin: store.alarmIntervalMinutes,
        keepSafetyAlarm: store.keepSafetyAlarm,
        automationTime: store.automationTime,
        scheduleTypes: store.scheduleTypes,
      },
    },
  });
  if (!savedRoutine.data || savedRoutine.error)
    requestFailed(
      "일정 유형과 알람 설정을 저장하지 못했어요.",
      savedRoutine.response.status,
    );
  const savedProfile = await apiClient.PUT("/api/v1/profile", {
    headers,
    body: {
      timezone: "Asia/Seoul",
      locale: "ko-KR",
      revision: profile.data.revision,
      automationMode:
        survey.automationMode === "automatic"
          ? "AUTO_ROUTINE_DAYS"
          : "RECOMMEND_ONLY",
      allowImportantEventDetection: true,
      allowAggregateOutcomeSync: survey.outcomeSync,
    },
  });
  if (!savedProfile.data || savedProfile.error)
    requestFailed(
      "알람 설정을 저장하지 못했어요.",
      savedProfile.response.status,
    );
  const today = localDate(serviceNow());
  const importedEvents =
    forceRefresh && store.events.length
      ? store.events
      : createMockCalendar(today);
  const { events, classifications } =
    await classifyCalendarEvents(importedEvents);
  await saveCalendarEvents(events);
  store.set({
    events,
    classifications,
    calendarConnected: true,
    enrolledAt: store.enrolledAt ?? serviceNow(),
  });
  await generateServicePlan();
}

export async function connectHealth() {
  const store = useServiceStore.getState();
  await localDataStore.put(
    "health-inputs",
    await healthKitDemoSource.read({
      now: serviceNow(),
      minutes: store.sleepMinutes,
      recentFirstAlarmSucceeded:
        useCurrentFlowStore.getState().onboardingDraft
          .recentFirstAlarmSucceeded,
    }),
  );
  store.set({ healthConnected: true });
  if (store.calendarConnected) await generateServicePlan();
}

export async function ensureMockCalendarCoverage() {
  const store = useServiceStore.getState();
  if (!store.calendarConnected) return;
  const existingIds = new Set(store.events.map((event) => event.clientId));
  const missing = createMockCalendar(localDate(serviceNow())).filter(
    (event) => !existingIds.has(event.clientId),
  );
  if (!missing.length) return;
  const classified = await classifyCalendarEvents(missing);
  const events = [...store.events, ...classified.events].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  await saveCalendarEvents(events);
  store.set({
    events,
    classifications: {
      ...store.classifications,
      ...classified.classifications,
    },
  });
}

export async function generateServicePlan() {
  const store = useServiceStore.getState();
  const now = serviceNow();
  const targetDate = addDays(localDate(now), 1);
  const headers = demoSessionHeaders(sessionId());
  const loadTargetSchedules = () =>
    apiClient.GET("/api/v1/schedule-events", {
      headers,
      params: {
        query: {
          from: atTime(targetDate, "00:00"),
          to: atTime(addDays(targetDate, 1), "00:00"),
          limit: 100,
        },
      },
    });
  const [initialSchedules, routines] = await Promise.all([
    loadTargetSchedules(),
    apiClient.GET("/api/v1/routines", { headers }),
  ]);
  let schedules = initialSchedules;
  const locallyStoredTarget = store.events.some(
    (event) => localDate(event.startsAt) === targetDate,
  );
  if (
    schedules.data &&
    !schedules.error &&
    schedules.data.items.length === 0 &&
    locallyStoredTarget
  ) {
    // The public web demo keeps its imported calendar in local storage while
    // the mock API is memory-only. Rehydrate it after a reload before planning.
    await saveCalendarEvents(store.events);
    schedules = await loadTargetSchedules();
  }
  if (!schedules.data || schedules.error || !routines.data || routines.error)
    requestFailed(
      "일정과 준비 시간을 불러오지 못했어요. 다시 시도해 주세요.",
      !schedules.data || schedules.error
        ? schedules.response.status
        : routines.response.status,
    );
  const event = schedules.data.items.sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  )[0];
  if (!event)
    throw new Error("내일 일정이 없어요. 캘린더에서 일정을 추가해 주세요.");
  const scheduleTypes = routines.data.alarmPreferences.scheduleTypes?.length
    ? routines.data.alarmPreferences.scheduleTypes
    : store.scheduleTypes;
  const scheduleType =
    scheduleTypes.find((item) => item.code === event.category) ??
    scheduleTypes.find((item) => item.isFallback) ??
    scheduleTypes[0];
  if (!scheduleType) throw new Error("일정 유형을 먼저 설정해 주세요.");
  const deadlineAt = new Date(
    Date.parse(event.startsAt) - scheduleType.wakeLeadMin * 60000,
  ).toISOString();
  const survey = useCurrentFlowStore.getState().onboardingDraft;
  const recent = [...store.records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-5);
  const personalizationHistory = [...store.records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);
  const failures = recent.filter(
    (r) => r.outcome === "UNCONFIRMED" || r.outcome === "CONFIRMED_LATE",
  ).length;
  const learned = (await localDataStore.getAll("wake-model")).find(
    (m) => m.id === "personal",
  );
  const healthInput = store.healthConnected
    ? await healthKitDemoSource.read({
        now,
        minutes: store.sleepMinutes,
        recentFirstAlarmSucceeded: recent.length
          ? recent[recent.length - 1].outcome === "CONFIRMED_ON_TIME"
          : survey.recentFirstAlarmSucceeded,
      })
    : null;
  if (healthInput) await localDataStore.put("health-inputs", healthInput);
  const localRecommendation = calculateWakeRecommendation({
    completedPreparationMinutes: 0,
    deadlineAt,
    importance: event.importance,
    maxProtocolLevel: Math.max(
      store.preferredAlarmCount,
      failures > 0 || store.sleepMinutes < 360 || event.importance !== "NORMAL"
        ? store.keepSafetyAlarm
          ? 3
          : store.preferredAlarmCount
        : store.preferredAlarmCount,
    ),
    alarmIntervalMinutes: store.alarmIntervalMinutes,
    preferredProtocolLevel: store.preferredAlarmCount,
    preferredFirstChannel: "PHONE_SOUND",
    personalSleepBaselineMinutes: store.records.length >= 10 ? 420 : undefined,
    historyProtocolAdjustment: Math.max(
      Math.min(2, failures),
      learned?.parameters.protocolAdjustment ?? 0,
    ),
    historyAdvanceMinutes:
      learned?.parameters.recommendedAdvanceMinutes ?? 0,
    healthInput,
  });
  const elapsedLearningDays = store.enrolledAt
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(`${localDate(now)}T00:00:00Z`) -
            Date.parse(`${localDate(store.enrolledAt)}T00:00:00Z`)) /
            86400_000,
        ),
      )
    : 0;
  let personalized: Awaited<ReturnType<typeof personalizeWakePlan>> | null =
    null;
  try {
    personalized = await personalizeWakePlan({
        category: scheduleType.code,
        importance: event.importance,
        eventHour: new Date(
          Date.parse(event.startsAt) + 9 * 3600_000,
        ).getUTCHours(),
        baseWakeLeadMin: scheduleType.wakeLeadMin,
        restMinutes: healthInput?.sleepDurationMinutes ?? null,
        activityLevel:
          healthInput?.activityLevel === "usual"
            ? "moderate"
            : (healthInput?.activityLevel ?? null),
        conditionLevel:
          healthInput?.conditionLevel === "usual"
            ? "normal"
            : (healthInput?.conditionLevel ?? null),
        recentOnTimeCount: personalizationHistory.filter(
          (record) => record.outcome === "CONFIRMED_ON_TIME",
        ).length,
        recentLateCount: personalizationHistory.filter(
          (record) => record.outcome === "CONFIRMED_LATE",
        ).length,
        recentMissedCount: personalizationHistory.filter(
          (record) => record.outcome === "UNCONFIRMED",
        ).length,
        recentAverageAlarmSteps: personalizationHistory.length
          ? personalizationHistory.reduce(
              (total, record) =>
                total + (record.alarmStepsUsed ?? store.preferredAlarmCount),
              0,
            ) / personalizationHistory.length
          : store.preferredAlarmCount,
        learningDays: elapsedLearningDays,
        preferredAlarmCount: store.preferredAlarmCount,
        preferredIntervalMin: store.alarmIntervalMinutes,
        keepSafetyAlarm: store.keepSafetyAlarm,
    });
  } catch (error) {
    if (getApiStatus(error) === 401) throw error;
    // Provider/network failures must not prevent the scheduled alarm.
  }
  const personalizedOffsets = personalized
    ? mergeAlarmOffsetsWithSafety(
        personalized.alarmOffsetsMin,
        localRecommendation.plan.steps.map((step) => step.offsetMin),
        failures > 0 ||
          store.sleepMinutes < 360 ||
          event.importance !== "NORMAL" ||
          (learned?.parameters.recommendedAdvanceMinutes ?? 0) > 0 ||
          (learned?.parameters.protocolAdjustment ?? 0) > 0,
      )
    : undefined;
  const lastPersonalizedOffset = personalizedOffsets?.at(-1) ?? 0;
  const candidatePlan = personalized
    ? {
        localDate: localDate(deadlineAt),
        timezone: "Asia/Seoul",
        deadlineAt,
        firstAlarmAt: new Date(
          Date.parse(deadlineAt) - lastPersonalizedOffset * 60000,
        ).toISOString(),
        finalAlarmAt: deadlineAt,
        importance: event.importance,
        protocolLevel: Math.min(4, personalizedOffsets!.length),
        steps: personalizedOffsets!.map((offsetMin, index) => ({
          order: index + 1,
          offsetMin,
          channel:
            store.keepSafetyAlarm &&
            index === personalizedOffsets!.length - 1 &&
            personalizedOffsets!.length > 1
              ? "FINAL_SAFETY"
              : "PHONE_SOUND",
        })),
        reasonCodes: personalized.reasonCodes,
        requiresApproval: personalized.requiresReview,
        modelVersion:
          personalized.source === "MODEL"
            ? "external-ai-personalized-v1"
            : "safe-fallback-personalized-v1",
      }
    : localRecommendation.plan;
  const earlyOverrideCanAcceptModelUncertainty =
    store.earlyAutomationEnabled &&
    event.importance === "NORMAL" &&
    personalized?.fatigueLevel !== "HIGH";
  const eligibility = automationEligibility({
    enrolledAt: store.enrolledAt ?? now,
    now,
    consent: survey.automationMode === "automatic",
    earlyOverride: store.earlyAutomationEnabled,
    records: store.records,
    importance: event.importance,
    requiresApproval:
      candidatePlan.requiresApproval &&
      !earlyOverrideCanAcceptModelUncertainty,
  });
  const plan = {
    ...candidatePlan,
    requiresApproval: !eligibility.automatic,
  };
  // Recalculation must retire the previous schedule before replacing it.
  if (
    store.plan &&
    ["APPROVED", "EDITED", "PROPOSED"].includes(store.plan.status)
  ) {
    await updateWakePlanDecision(sessionId(), store.plan.id, {
      decision: "DECLINE",
      revision: store.plan.revision,
    });
    store.set({
      plan: {
        ...store.plan,
        status: "DECLINED",
        revision: store.plan.revision + 1,
      },
    });
    useCurrentFlowStore.getState().setActiveWakePlan(null);
  }
  const saved = await createWakePlan(
    sessionId(),
    plan,
    `service:${crypto.randomUUID()}`,
  );
  let persisted = { revision: saved.revision, status: saved.status };
  if (eligibility.automatic)
    persisted = await updateWakePlanDecision(sessionId(), saved.id, {
      decision: "APPROVE",
      revision: saved.revision,
    });
  const reasonSummary = [
    `${scheduleType.label} 유형 · 일정 ${scheduleType.wakeLeadMin}분 전까지 기상`,
    healthInput
      ? `온디바이스 건강 요약 · 수면 ${Math.floor((healthInput.sleepDurationMinutes ?? 0) / 60)}시간 ${(healthInput.sleepDurationMinutes ?? 0) % 60}분 · 걸음 ${(healthInput.stepCount ?? 0).toLocaleString("ko-KR")}보 · 활동 ${healthInput.exerciseMinutes ?? 0}분`
      : "건강 데이터 연결 전이라 일정과 기상 기록으로 안전 알람을 계산했어요",
    ...(healthInput?.activityLevel === "high" || healthInput?.conditionLevel === "low"
      ? ["활동량과 회복 신호를 종합한 피로도가 높아 안전 단계를 강화했어요"]
      : []),
    failures
      ? `최근 기상 실패 ${failures}회를 반영했어요`
      : "최근 기상 패턴을 반영했어요",
    ...((learned?.parameters.recommendedAdvanceMinutes ?? 0) > 0
      ? [
          `학습된 습관에 맞춰 첫 알람을 ${learned?.parameters.recommendedAdvanceMinutes}분 더 일찍 시작해요`,
        ]
      : []),
  ].join(". ");
  const explanation = personalized
    ? {
        explanation: `${personalized.explanation} ${reasonSummary}`.slice(
          0,
          500,
        ),
        source: personalized.source,
      }
    : await explainServicePlan(plan.reasonCodes, reasonSummary);
  const result: ServicePlan = {
    ...plan,
    id: saved.id,
    ...persisted,
    automatic: eligibility.automatic,
    eventTitle: event.displayTitle ?? "내일 일정",
    eventAt: event.startsAt,
    scheduleTypeLabel: scheduleType.label,
    wakeLeadMinutes: scheduleType.wakeLeadMin,
    sleepMinutes: store.sleepMinutes,
    reason: explanation.explanation,
    explanationSource: explanation.source,
    fatigueScore:
      personalized?.fatigueScore ?? Math.min(100, 30 + failures * 20),
    fatigueLevel:
      personalized?.fatigueLevel ??
      (store.sleepMinutes < 360 || failures > 1
        ? "HIGH"
        : store.sleepMinutes < 420 || failures === 1
          ? "MEDIUM"
          : "LOW"),
    aiConfidence: personalized?.confidence ?? 0.35,
  };
  const reportContext = createWakePlanReportContext({
    schedule: {
      title: event.displayTitle ?? "내일 일정",
      startsAt: event.startsAt,
      categoryCode: scheduleType.code,
      categoryLabel: scheduleType.label,
      wakeLeadMin: scheduleType.wakeLeadMin,
    },
    healthSummary: healthInput
      ? {
          restMinutes: healthInput.sleepDurationMinutes ?? null,
          usualRestMinutes: 420,
          activityLevel:
            healthInput.activityLevel === "usual"
              ? "moderate"
              : (healthInput.activityLevel ?? null),
          conditionLevel:
            healthInput.conditionLevel === "usual"
              ? "normal"
              : (healthInput.conditionLevel ?? null),
        }
      : null,
    historySignals: {
      recentOnTimeCount: personalizationHistory.filter(
        (record) => record.outcome === "CONFIRMED_ON_TIME",
      ).length,
      recentLateCount: personalizationHistory.filter(
        (record) => record.outcome === "CONFIRMED_LATE",
      ).length,
      recentMissedCount: personalizationHistory.filter(
        (record) => record.outcome === "UNCONFIRMED",
      ).length,
      recentAverageAlarmSteps: personalizationHistory.length
        ? personalizationHistory.reduce(
            (total, record) =>
              total + (record.alarmStepsUsed ?? store.preferredAlarmCount),
            0,
          ) / personalizationHistory.length
        : store.preferredAlarmCount,
      learningDays: elapsedLearningDays,
      recommendedAdvanceMinutes:
        learned?.parameters.recommendedAdvanceMinutes ?? 0,
      protocolAdjustment: learned?.parameters.protocolAdjustment ?? 0,
    },
    alarmPreferences: {
      preferredAlarmCount: store.preferredAlarmCount,
      preferredIntervalMin: store.alarmIntervalMinutes,
      keepSafetyAlarm: store.keepSafetyAlarm,
    },
    personalization: {
      fatigueScore: result.fatigueScore,
      fatigueLevel: result.fatigueLevel,
      confidence: result.aiConfidence,
      explanation: result.reason,
      source: result.explanationSource,
      automatic: result.automatic,
    },
  });
  store.set({
    plan: result,
    lastAutomationSlot: localDate(now),
    alarmRuntime: emptyAlarmRuntime(
      result.id,
      result.steps.map((step) => step.order),
    ),
    alarmStage: "idle",
  });
  await saveLocalReportContext(result, reportContext);
  try {
    await putWakePlanReportContext(sessionId(), result.id, reportContext);
  } catch {
    // The local report remains available even if optional server sync fails.
  }
  useCurrentFlowStore.getState().setWakeResult(null);
  useCurrentFlowStore
    .getState()
    .setActiveWakePlan(eligibility.automatic ? result : null);
}

export async function decideServicePlan(
  decision: "APPROVE" | "DECLINE" | "EDIT",
  firstAlarmAt?: string,
) {
  const store = useServiceStore.getState();
  const plan = store.plan;
  if (!plan) return;
  const validationMessage = firstAlarmAt
    ? alarmEditValidationMessage(plan, firstAlarmAt)
    : null;
  if (validationMessage) throw new Error(validationMessage);
  const changes = firstAlarmAt
    ? shiftAlarmSchedule(plan, firstAlarmAt)
    : undefined;
  const saved = await updateWakePlanDecision(sessionId(), plan.id, {
    decision,
    revision: plan.revision,
    ...(changes ? { changes } : {}),
  });
  const updated = {
    ...plan,
    ...saved,
    ...changes,
  };
  store.set({
    plan: updated,
    ...(firstAlarmAt
      ? {
          alarmRuntime: emptyAlarmRuntime(
            plan.id,
            plan.steps.map((step) => step.order),
          ),
          alarmStage: "idle" as const,
        }
      : {}),
  });
  await updateLocalReportPlan(updated);
  useCurrentFlowStore
    .getState()
    .setActiveWakePlan(decision === "DECLINE" ? null : updated);
}

function eventOccurredAt() {
  return useServiceStore.getState().virtualNow ?? new Date().toISOString();
}

function runtimeForPlan(plan: ServicePlan) {
  const runtime = useServiceStore.getState().alarmRuntime;
  if (runtime?.planId === plan.id) {
    return {
      ...runtime,
      remainingStepOrders:
        runtime.remainingStepOrders ??
        plan.steps
          .map((step) => step.order)
          .filter(
            (order) =>
              order !== runtime.currentStepOrder &&
              !runtime.completedStepOrders.includes(order),
          ),
    };
  }
  return emptyAlarmRuntime(
    plan.id,
    plan.steps.map((step) => step.order),
  );
}

export async function recordAlarmLifecycleEvent(
  plan: ServicePlan,
  stepOrder: number,
  eventType: AlarmEventType,
  occurredAt = eventOccurredAt(),
) {
  const store = useServiceStore.getState();
  let runtime = runtimeForPlan(plan);
  const key = alarmEventKey(plan.id, stepOrder, eventType);
  const existing = runtime.events.find((event) => event.key === key);
  if (!existing) {
    runtime = queueAlarmEvent(runtime, {
      planId: plan.id,
      stepOrder,
      eventType,
      occurredAt,
    });
    store.set({ alarmRuntime: runtime });
    await saveLocalAlarmEvent(plan, stepOrder, eventType, occurredAt);
  }
  const queued = existing ?? runtime.events.find((event) => event.key === key);
  if (!queued || queued.synced) return;
  void syncAlarmEvent(plan, queued);
}

const syncingAlarmEventKeys = new Set<string>();

async function syncAlarmEvent(
  plan: ServicePlan,
  queued: ReturnType<typeof runtimeForPlan>["events"][number],
) {
  if (syncingAlarmEventKeys.has(queued.key)) return;
  syncingAlarmEventKeys.add(queued.key);
  try {
    await postAlarmEvent(
      sessionId(),
      plan.id,
      {
        stepOrder: queued.stepOrder,
        eventType: queued.eventType,
        occurredAt: queued.occurredAt,
      },
    );
    const latest = runtimeForPlan(plan);
    useServiceStore.getState().set({
      alarmRuntime: {
        ...latest,
        events: latest.events.map((event) =>
          event.key === queued.key ? { ...event, synced: true } : event,
        ),
      },
    });
  } catch {
    // Alarm interaction is local-first; the same natural event key is retried.
  } finally {
    syncingAlarmEventKeys.delete(queued.key);
  }
}

export async function syncPendingAlarmEvents() {
  const plan = useServiceStore.getState().plan;
  if (!plan) return;
  const pending = runtimeForPlan(plan).events.filter((event) => !event.synced);
  for (const event of pending) {
    await syncAlarmEvent(plan, event);
  }
}

export async function triggerNextAlarmStep(force = false) {
  const store = useServiceStore.getState();
  const plan = store.plan;
  if (!plan || plan.status === "COMPLETED") return false;
  let runtime = runtimeForPlan(plan);
  const now = eventOccurredAt();
  const step = nextAlarmStep(plan, runtime, now, force);
  if (!step) return false;

  const unresolved =
    runtime.awaitingConfirmationStepOrder ?? runtime.currentStepOrder;
  if (unresolved !== null && unresolved !== step.order) {
    await recordAlarmLifecycleEvent(plan, unresolved, "MISSED", now);
    runtime = completeAlarmStep(runtimeForPlan(plan), unresolved);
    store.set({ alarmRuntime: runtime, alarmStage: "idle" });
    stopAlarmSound();
  }

  await recordAlarmLifecycleEvent(plan, step.order, "RANG", now);
  runtime = runtimeForPlan(plan);
  store.set({
    alarmRuntime: {
      ...runtime,
      currentStepOrder: step.order,
      awaitingConfirmationStepOrder: null,
      remainingStepOrders: runtime.remainingStepOrders.filter(
        (order) => order !== step.order,
      ),
    },
    alarmStage: "ringing",
  });
  try {
    await startAlarmSound();
  } catch {
    store.set({
      message:
        "음소거 자동 재생이 차단됐어요. 알람 화면에서 재생 버튼을 눌러 주세요.",
    });
  }
  return true;
}

export async function triggerDemoAlarmStep() {
  const store = useServiceStore.getState();
  const plan = store.plan;
  if (!plan) return false;
  const runtime = runtimeForPlan(plan);
  const step = nextAlarmStep(plan, runtime, eventOccurredAt(), true);
  if (!step) return false;
  store.set({ virtualNow: alarmScheduledAt(plan, step.order) });
  return triggerNextAlarmStep(true);
}

export async function dismissCurrentAlarm() {
  const store = useServiceStore.getState();
  const plan = store.plan;
  const stepOrder = plan ? runtimeForPlan(plan).currentStepOrder : null;
  if (!plan || stepOrder === null) return;
  stopAlarmSound();
  await recordAlarmLifecycleEvent(plan, stepOrder, "DISMISSED");
  const runtime = runtimeForPlan(plan);
  store.set({
    alarmStage: "confirm",
    alarmRuntime: {
      ...runtime,
      awaitingConfirmationStepOrder: stepOrder,
    },
  });
}

export async function confirmCurrentAlarm(success: boolean) {
  const store = useServiceStore.getState();
  const plan = store.plan;
  if (!plan) return;
  const runtime = runtimeForPlan(plan);
  const stepOrder =
    runtime.awaitingConfirmationStepOrder ?? runtime.currentStepOrder;
  if (stepOrder === null) return;
  const now = eventOccurredAt();

  if (success) {
    await recordAlarmLifecycleEvent(plan, stepOrder, "CONFIRMED_AWAKE", now);
    for (const remainingOrder of remainingAlarmStepOrders(
      plan,
      runtimeForPlan(plan),
    )) {
      await recordAlarmLifecycleEvent(
        plan,
        remainingOrder,
        "CANCELLED",
        now,
      );
    }
    const completed = completeAlarmStep(runtimeForPlan(plan), stepOrder);
    store.set({
      alarmRuntime: {
        ...completed,
        completedStepOrders: plan.steps.map((step) => step.order),
        remainingStepOrders: [],
      },
    });
    await saveServiceOutcome(true, stepOrder);
    return;
  }

  await recordAlarmLifecycleEvent(plan, stepOrder, "MISSED", now);
  const completed = completeAlarmStep(runtimeForPlan(plan), stepOrder);
  const remaining = remainingAlarmStepOrders(plan, completed);
  store.set({ alarmRuntime: completed, alarmStage: "idle" });
  if (remaining.length) {
    store.set({ message: "다음 알람을 준비할게요. 조금 더 쉬어도 괜찮아요." });
    return;
  }
  const executedSteps = completed.events.filter(
    (event) => event.eventType === "RANG",
  ).length;
  await saveServiceOutcome(false, Math.max(1, executedSteps));
}

export async function saveServiceOutcome(
  success: boolean,
  alarmStepsUsed?: number,
) {
  stopAlarmSound();
  const store = useServiceStore.getState();
  const plan = store.plan;
  if (!plan || plan.status === "COMPLETED") return;
  const completedAt = store.virtualNow ?? new Date().toISOString();
  const outcome = success
    ? Date.parse(completedAt) <= Date.parse(plan.finalAlarmAt)
      ? "CONFIRMED_ON_TIME"
      : "CONFIRMED_LATE"
    : "UNCONFIRMED";
  const result = {
    planId: plan.id,
    outcome,
    alarmStepsUsed:
      alarmStepsUsed ?? (success ? 1 : plan.steps.length),
    completedAt,
    confirmedAt: success ? completedAt : null,
    userCorrection: true,
  } as const;
  const learning = await applyWakeLearning(result, plan.localDate);
  const learningEffect: WakeLearningEffect = {
    previousAdvanceMinutes: learning.previousAdvanceMinutes,
    nextAdvanceMinutes: learning.nextAdvanceMinutes,
    previousProtocolAdjustment: learning.previousProtocolAdjustment,
    nextProtocolAdjustment: learning.nextProtocolAdjustment,
    recommendation: learning.nextRecommendation,
    reasonCodes: learning.reasonCodes,
    policyVersion: "wake-learning-1",
  };
  await saveLocalWakeOutcome(plan, result);
  await saveLocalLearningEffect(plan.localDate, learningEffect);
  try {
    await putWakeLearningEffect(sessionId(), plan.id, learningEffect);
  } catch {
    // Learning remains local and can still explain future recommendations.
  }
  let syncMessage: string | null = learning.nextRecommendation;
  if (useCurrentFlowStore.getState().onboardingDraft.outcomeSync) {
    try {
      await syncWakeOutcome(sessionId(), result);
    } catch (error) {
      if (getApiStatus(error) === 401) throw error;
      syncMessage = `${learning.nextRecommendation} 서버 동기화는 실패했어요.`;
    }
  }
  const record = {
    date: plan.localDate,
    outcome: result.outcome,
    source: "observed" as const,
    alarmStepsUsed: result.alarmStepsUsed,
  };
  store.set({
    records: [
      ...store.records.filter((r) => r.date !== plan.localDate),
      record,
    ],
    plan: { ...plan, status: "COMPLETED" },
    alarmStage: "idle",
    message: syncMessage,
  });
  useCurrentFlowStore.getState().setWakeResult(result);
  useCurrentFlowStore.getState().setActiveWakePlan(null);
}

export async function advanceAutomation(preview = false) {
  const store = useServiceStore.getState();
  const now = serviceNow();
  let date = localDate(now);
  if (Date.parse(atTime(date, store.automationTime)) <= Date.parse(now))
    date = addDays(date, 1);
  if (preview) {
    const flow = useCurrentFlowStore.getState();
    const previousDraft = flow.onboardingDraft;
    if (previousDraft.automationMode !== "automatic") {
      flow.setOnboardingDraft({
        ...previousDraft,
        automationMode: "automatic",
      });
      try {
        await saveServiceProfile();
      } catch (error) {
        flow.setOnboardingDraft(previousDraft);
        throw error;
      }
    }
    date = addDays(localDate(store.enrolledAt ?? now), 14);
    if (date < localDate(now)) date = addDays(localDate(now), 1);
    const records = [...store.records];
    for (let i = 1; i <= 12; i++) {
      const recordDate = addDays(date, -i);
      if (!records.some((r) => r.date === recordDate))
        records.push({
          date: recordDate,
          outcome: "CONFIRMED_ON_TIME",
          source: "preview",
          alarmStepsUsed: 1,
        });
    }
    store.set({
      records,
      preview: true,
      sleepMinutes: 435,
      earlyAutomationEnabled: false,
    });
  }
  store.set({
    virtualNow: atTime(date, store.automationTime),
    alarmStage: "idle",
  });
  stopAlarmSound();
  await generateServicePlan();
}

export async function editCalendarEvent(event: CalendarEntry) {
  const store = useServiceStore.getState();
  await saveCalendarEvents([event]);
  store.set({
    events: [
      ...store.events.filter((e) => e.clientId !== event.clientId),
      event,
    ],
  });
  await generateServicePlan();
}
