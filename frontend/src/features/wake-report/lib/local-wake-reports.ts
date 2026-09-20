import type { components } from "@kkaeddak/api-client";

import type { WakeResult } from "@/features/current-flow/model/current-flow-store";
import type { ServicePlan } from "@/features/service/model/service-store";
import {
  localDataStore,
  type LocalWakeReportRecord,
} from "@/lib/storage/local-data";
import type {
  AlarmEventType,
  HistoryReportDetail,
  HistoryReportListItem,
  WakeLearningEffect,
  WakePlanReportContext,
} from "../api/wake-report-api";

type WakeAlarmTimelineStep = components["schemas"]["WakeAlarmTimelineStep"];

function planTimeline(plan: ServicePlan): WakeAlarmTimelineStep[] {
  return [...plan.steps]
    .sort((a, b) => a.order - b.order)
    .map((step) => ({
      order: step.order,
      channel: step.channel,
      scheduledAt: new Date(
        Date.parse(plan.firstAlarmAt) + step.offsetMin * 60_000,
      ).toISOString(),
      events: [],
    }));
}

function localPlan(plan: ServicePlan): HistoryReportDetail["plan"] {
  return {
    id: plan.id,
    localDate: plan.localDate,
    timezone: plan.timezone,
    deadlineAt: plan.deadlineAt,
    firstAlarmAt: plan.firstAlarmAt,
    finalAlarmAt: plan.finalAlarmAt,
    importance: plan.importance,
    protocolLevel: plan.protocolLevel,
    steps: plan.steps,
    reasonCodes: plan.reasonCodes,
    requiresApproval: plan.requiresApproval,
    modelVersion: plan.modelVersion,
    revision: plan.revision,
    status: plan.status,
  };
}

async function findLocalReport(localDate: string) {
  return (await localDataStore.getAll("wake-reports")).find(
    (report) => report.localDate === localDate,
  );
}

async function putLocalReport(report: LocalWakeReportRecord) {
  await localDataStore.put("wake-reports", {
    ...report,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveLocalReportContext(
  plan: ServicePlan,
  decisionContext: WakePlanReportContext,
) {
  const existing = await findLocalReport(plan.localDate);
  await putLocalReport({
    id: plan.localDate,
    localDate: plan.localDate,
    plan: localPlan(plan),
    decisionContext,
    alarmTimeline:
      existing?.plan.id === plan.id
        ? existing.alarmTimeline
        : planTimeline(plan),
    outcome: existing?.plan.id === plan.id ? existing.outcome : null,
    learningEffect:
      existing?.plan.id === plan.id ? existing.learningEffect : null,
    updatedAt: existing?.updatedAt ?? new Date().toISOString(),
  });
}

export async function updateLocalReportPlan(plan: ServicePlan) {
  const existing = await findLocalReport(plan.localDate);
  if (!existing) return;
  const refreshedTimeline = planTimeline(plan).map((step) => ({
    ...step,
    events:
      existing.alarmTimeline.find((candidate) => candidate.order === step.order)
        ?.events ?? [],
  }));
  await putLocalReport({
    ...existing,
    plan: localPlan(plan),
    alarmTimeline: refreshedTimeline,
  });
}

export async function saveLocalAlarmEvent(
  plan: ServicePlan,
  stepOrder: number,
  eventType: AlarmEventType,
  occurredAt: string,
) {
  const existing = await findLocalReport(plan.localDate);
  const timeline = existing?.alarmTimeline ?? planTimeline(plan);
  const nextTimeline = timeline.map((step) => {
    if (step.order !== stepOrder) return step;
    if (step.events.some((event) => event.eventType === eventType)) return step;
    return {
      ...step,
      events: [
        ...step.events,
        {
          id: `local:${plan.id}:${stepOrder}:${eventType}`,
          stepOrder,
          eventType,
          occurredAt,
        },
      ],
    };
  });
  await putLocalReport({
    id: plan.localDate,
    localDate: plan.localDate,
    plan: localPlan(plan),
    decisionContext: existing?.decisionContext ?? null,
    alarmTimeline: nextTimeline,
    outcome: existing?.outcome ?? null,
    learningEffect: existing?.learningEffect ?? null,
    updatedAt: existing?.updatedAt ?? occurredAt,
  });
}

export async function saveLocalWakeOutcome(
  plan: ServicePlan,
  result: WakeResult,
) {
  const existing = await findLocalReport(plan.localDate);
  await putLocalReport({
    id: plan.localDate,
    localDate: plan.localDate,
    plan: { ...localPlan(plan), status: "COMPLETED" },
    decisionContext: existing?.decisionContext ?? null,
    alarmTimeline: existing?.alarmTimeline ?? planTimeline(plan),
    outcome: {
      alarmStepsUsed: result.alarmStepsUsed,
      confirmedAt: result.confirmedAt,
      outcome: result.outcome,
      onTime:
        result.outcome === "CONFIRMED_ON_TIME"
          ? true
          : result.outcome === "CONFIRMED_LATE"
            ? false
            : null,
      userCorrection: result.userCorrection,
    },
    learningEffect: existing?.learningEffect ?? null,
    updatedAt: existing?.updatedAt ?? result.completedAt,
  });
}

export async function saveLocalLearningEffect(
  localDate: string,
  effect: WakeLearningEffect,
) {
  const existing = await findLocalReport(localDate);
  if (!existing) return;
  await putLocalReport({ ...existing, learningEffect: effect });
}

export async function getLocalWakeReports() {
  return localDataStore.getAll("wake-reports");
}

export async function getLocalWakeReport(localDate: string) {
  return findLocalReport(localDate);
}

export function localReportListItem(
  report: LocalWakeReportRecord,
): HistoryReportListItem {
  return {
    localDate: report.localDate,
    planId: report.plan.id,
    status: report.plan.status,
    eventTitle: report.decisionContext?.schedule.title ?? null,
    firstAlarmAt: report.plan.firstAlarmAt,
    finalAlarmAt: report.plan.finalAlarmAt,
    alarmCount: report.plan.steps.length,
    outcome: report.outcome?.outcome ?? null,
    reportReady: Boolean(report.decisionContext),
  };
}

export function mergeHistoryReportDetail(
  server: HistoryReportDetail | null,
  local: LocalWakeReportRecord | undefined,
): HistoryReportDetail | null {
  if (!server) return local ?? null;
  if (!local || local.plan.id !== server.plan.id) return server;
  return {
    ...server,
    decisionContext: server.decisionContext ?? local.decisionContext,
    learningEffect: server.learningEffect ?? local.learningEffect,
    outcome: server.outcome ?? local.outcome,
    alarmTimeline: server.alarmTimeline.map((serverStep) => {
      const localStep = local.alarmTimeline.find(
        (step) => step.order === serverStep.order,
      );
      if (!localStep) return serverStep;
      const events = new Map(
        [...localStep.events, ...serverStep.events].map((event) => [
          `${event.stepOrder}:${event.eventType}`,
          event,
        ]),
      );
      return { ...serverStep, events: Array.from(events.values()) };
    }),
  };
}
