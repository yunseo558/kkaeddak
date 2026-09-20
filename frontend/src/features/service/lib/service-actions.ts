import { demoSessionHeaders } from "@kkaeddak/api-client";
import { apiClient } from "@/lib/api/client";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { createDemoSession } from "@/features/demo-session/api/create-demo-session";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { calculateWakeRecommendation } from "@/features/wake-plan/lib/recommendation-engine";
import {
  createWakePlan,
  updateWakePlanDecision,
} from "@/features/wake-plan/api/wake-plan-api";
import { applyWakeLearning } from "@/features/wake-result/lib/wake-learning";
import { syncWakeOutcome } from "@/features/wake-result/api/wake-outcome-api";
import { localDataStore } from "@/lib/storage/local-data";
import {
  useServiceStore,
  type CalendarEntry,
  type ScheduleClassification,
  type ScheduleTypeRule,
  type ServicePlan,
} from "../model/service-store";
import {
  addDays,
  atTime,
  automationEligibility,
  localDate,
} from "../model/service-policy";
import { stopAlarmSound } from "./alarm-audio";
import { createMockCalendar, mockSleepSource } from "./mock-integrations";

export const serviceNow = () =>
  useServiceStore.getState().virtualNow ?? new Date().toISOString();

function sessionId() {
  const id = useDemoSessionStore.getState().sessionId;
  if (!id)
    throw new Error("연결된 계정이 없습니다. 캘린더 연결부터 완료해 주세요.");
  return id;
}

// Mutations are serialized across the phone UI and its presentation controls.
export async function serviceAction(action: () => Promise<void>) {
  const store = useServiceStore.getState();
  if (store.busy) return;
  store.set({ busy: true, message: null });
  try {
    await action();
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? error.status
        : null;
    store.set({
      message:
        status === 401
          ? "연결이 만료됐어요. 캘린더에서 다시 연결해 주세요."
          : status === 409
            ? "다른 변경과 겹쳤어요. 캘린더에서 계획을 다시 계산해 주세요."
            : error instanceof Error && !status
              ? error.message
              : "저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
    });
  } finally {
    store.set({ busy: false });
  }
}

export async function saveCalendarEvents(events: CalendarEntry[]) {
  const result = await apiClient.POST("/api/v1/schedule-events:batch", {
    headers: demoSessionHeaders(sessionId()),
    body: { events },
  });
  if (!result.data || result.error || result.data.rejected.length)
    throw new Error("일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
    throw new Error(
      "일정 유형을 판단하지 못했어요. 직접 유형을 선택해 주세요.",
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
  } catch {
    // Explanations are optional; plan creation must keep working offline.
  }
  return { explanation: summary, source: "TEMPLATE" as const };
}

async function personalizeWakePlan(input: {
  externalAiConsent: true;
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
    throw new Error("AI 개인화 계획을 계산하지 못했어요.");
  return result.data;
}

async function classifyCalendarEvents(events: CalendarEntry[]) {
  const classifications: Record<string, ScheduleClassification> = {};
  const byTitle = new Map<string, ScheduleClassification>();
  for (const event of events) {
    const title = event.displayTitle ?? "일정";
    let classification = byTitle.get(title);
    if (!classification) {
      classification = await classifyScheduleTitle(title);
      byTitle.set(title, classification);
    }
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

export async function saveServicePreferences() {
  const store = useServiceStore.getState();
  const headers = demoSessionHeaders(sessionId());
  const routine = await apiClient.GET("/api/v1/routines", { headers });
  if (!routine.data || routine.error)
    throw new Error("알람 설정을 불러오지 못했어요.");
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
    throw new Error("알람 설정을 저장하지 못했어요.");
}

export async function connectCalendar() {
  const store = useServiceStore.getState();
  let id = useDemoSessionStore.getState().sessionId;
  const expires = useDemoSessionStore.getState().expiresAt;
  if (!id || !expires || Date.parse(expires) <= Date.now()) {
    const session = await createDemoSession("regular-class");
    useDemoSessionStore.getState().startServer({
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      scenarioId: "regular-class",
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
    throw new Error("설정을 불러오지 못했어요. 다시 연결해 주세요.");
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
    throw new Error("일정 유형과 알람 설정을 저장하지 못했어요.");
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
    throw new Error("알람 설정을 저장하지 못했어요.");
  const today = localDate(serviceNow());
  const { events, classifications } = await classifyCalendarEvents(
    createMockCalendar(today),
  );
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
    await mockSleepSource.read({
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
    throw new Error(
      "일정과 준비 시간을 불러오지 못했어요. 다시 시도해 주세요.",
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
    ? await mockSleepSource.read({
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
  if (survey.aiPersonalizationConsent === true) {
    const explicitConsent: true = survey.aiPersonalizationConsent;
    try {
      personalized = await personalizeWakePlan({
        externalAiConsent: explicitConsent,
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
    } catch {
      // Provider/network failures must not prevent the scheduled alarm.
    }
  }
  const personalizedOffsets = personalized?.alarmOffsetsMin;
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
        protocolLevel: Math.min(4, personalized.alarmOffsetsMin.length),
        steps: personalized.alarmOffsetsMin.map((offsetMin, index) => ({
          order: index + 1,
          offsetMin,
          channel:
            store.keepSafetyAlarm &&
            index === personalized.alarmOffsetsMin.length - 1 &&
            personalized.alarmOffsetsMin.length > 1
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
  let persisted = { revision: saved.revision, status: saved.status as string };
  if (eligibility.automatic)
    persisted = await updateWakePlanDecision(sessionId(), saved.id, {
      decision: "APPROVE",
      revision: saved.revision,
    });
  const reasonSummary = [
    `${scheduleType.label} 유형 · 일정 ${scheduleType.wakeLeadMin}분 전까지 기상`,
    store.healthConnected
      ? `최근 수면 ${Math.floor(store.sleepMinutes / 60)}시간 ${store.sleepMinutes % 60}분`
      : "수면 데이터 연결 전이라 안전 알람을 포함했어요",
    ...(store.healthConnected && store.sleepMinutes < 360
      ? ["활동량이 많고 피곤한 상태라 안전 단계를 강화했어요"]
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
  store.set({ plan: result, lastAutomationSlot: localDate(now) });
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
  const finalAlarmAt =
    firstAlarmAt && plan.steps.length === 1 ? firstAlarmAt : plan.finalAlarmAt;
  const changes = firstAlarmAt ? { firstAlarmAt, finalAlarmAt } : undefined;
  if (
    firstAlarmAt &&
    (Date.parse(firstAlarmAt) > Date.parse(plan.finalAlarmAt) ||
      Date.parse(firstAlarmAt) < Date.parse(plan.finalAlarmAt) - 240 * 60000)
  )
    throw new Error("첫 알람은 최종 알람 이전 4시간 이내로 정해 주세요.");
  if (
    firstAlarmAt &&
    plan.steps.length > 2 &&
    Date.parse(firstAlarmAt) +
      plan.steps[plan.steps.length - 2].offsetMin * 60000 >=
      Date.parse(plan.finalAlarmAt)
  )
    throw new Error(
      "예비 알람이 최종 알람보다 먼저 울리도록 첫 알람을 조금 앞당겨 주세요.",
    );
  const saved = await updateWakePlanDecision(sessionId(), plan.id, {
    decision,
    revision: plan.revision,
    ...(changes ? { changes } : {}),
  });
  const updated = {
    ...plan,
    ...saved,
    ...(firstAlarmAt ? { firstAlarmAt, finalAlarmAt } : {}),
  };
  store.set({ plan: updated });
  useCurrentFlowStore
    .getState()
    .setActiveWakePlan(decision === "DECLINE" ? null : updated);
}

export async function saveServiceOutcome(success: boolean) {
  stopAlarmSound();
  const store = useServiceStore.getState();
  const plan = store.plan;
  if (!plan || plan.status === "COMPLETED") return;
  const completedAt = store.virtualNow ?? new Date().toISOString();
  const outcome = success ? "CONFIRMED_ON_TIME" : "UNCONFIRMED";
  const result = {
    planId: plan.id,
    outcome,
    alarmStepsUsed: success ? 1 : plan.steps.length,
    completedAt,
    confirmedAt: success ? plan.firstAlarmAt : null,
    userCorrection: true,
  } as const;
  const learning = await applyWakeLearning(result, plan.localDate);
  let syncMessage: string | null = learning.nextRecommendation;
  if (useCurrentFlowStore.getState().onboardingDraft.outcomeSync) {
    try {
      await syncWakeOutcome(sessionId(), result);
    } catch {
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
    store.set({ records, preview: true, sleepMinutes: 435 });
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
