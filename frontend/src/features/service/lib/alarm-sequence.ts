import type {
  AlarmEventType,
  AlarmRuntimeEvent,
  AlarmRuntimeState,
  ServicePlan,
} from "../model/service-store";

export const ALARM_GRACE_MS = 4 * 60 * 60 * 1000;

export function emptyAlarmRuntime(
  planId: string | null = null,
  remainingStepOrders: number[] = [],
): AlarmRuntimeState {
  return {
    planId,
    currentStepOrder: null,
    completedStepOrders: [],
    awaitingConfirmationStepOrder: null,
    remainingStepOrders,
    events: [],
  };
}

export function alarmScheduledAt(
  plan: Pick<ServicePlan, "firstAlarmAt" | "steps">,
  stepOrder: number,
) {
  const step = plan.steps.find((candidate) => candidate.order === stepOrder);
  if (!step) throw new Error("알람 단계를 찾지 못했어요.");
  return new Date(
    Date.parse(plan.firstAlarmAt) + step.offsetMin * 60_000,
  ).toISOString();
}

export function alarmEventKey(
  planId: string,
  stepOrder: number,
  eventType: AlarmEventType,
) {
  return `${planId}:${stepOrder}:${eventType}`;
}

export function queueAlarmEvent(
  runtime: AlarmRuntimeState,
  event: Omit<AlarmRuntimeEvent, "key" | "synced">,
) {
  const key = alarmEventKey(event.planId, event.stepOrder, event.eventType);
  if (runtime.events.some((candidate) => candidate.key === key)) return runtime;
  return {
    ...runtime,
    events: [...runtime.events, { ...event, key, synced: false }],
  };
}

export function completeAlarmStep(
  runtime: AlarmRuntimeState,
  stepOrder: number,
) {
  return {
    ...runtime,
    currentStepOrder: null,
    awaitingConfirmationStepOrder: null,
    remainingStepOrders: runtime.remainingStepOrders.filter(
      (order) => order !== stepOrder,
    ),
    completedStepOrders: runtime.completedStepOrders.includes(stepOrder)
      ? runtime.completedStepOrders
      : [...runtime.completedStepOrders, stepOrder],
  };
}

export function nextAlarmStep(
  plan: Pick<ServicePlan, "status" | "firstAlarmAt" | "finalAlarmAt" | "steps">,
  runtime: AlarmRuntimeState,
  now: string,
  force = false,
) {
  if (!["APPROVED", "EDITED"].includes(plan.status)) return null;
  const nowMs = Date.parse(now);
  if (!force && nowMs > Date.parse(plan.finalAlarmAt) + ALARM_GRACE_MS) {
    return null;
  }
  return [...plan.steps]
    .sort((a, b) => a.order - b.order)
    .find((step) => {
      if (runtime.completedStepOrders.includes(step.order)) return false;
      if (runtime.currentStepOrder === step.order) return false;
      return force || nowMs >= Date.parse(alarmScheduledAt(plan, step.order));
    }) ?? null;
}

export function remainingAlarmStepOrders(
  plan: Pick<ServicePlan, "steps">,
  runtime: AlarmRuntimeState,
) {
  return [...plan.steps]
    .sort((a, b) => a.order - b.order)
    .map((step) => step.order)
    .filter(
      (order) =>
        order !== runtime.currentStepOrder &&
        !runtime.completedStepOrders.includes(order),
    );
}
