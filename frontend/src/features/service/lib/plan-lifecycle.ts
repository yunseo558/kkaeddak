import type { useServiceStore } from "../model/service-store";
import { addDays, clockTime, localDate } from "../model/service-policy";
import { ALARM_GRACE_MS } from "./alarm-sequence";

type State = Pick<ReturnType<typeof useServiceStore.getState>,
  "plan" | "alarmRuntime" | "automationTime" | "lastAutomationSlot" | "lastPlannedDate">;

export function shouldGenerateScheduledPlan(state: State, now: string) {
  const { plan, alarmRuntime } = state;
  if (plan && ["APPROVED", "EDITED"].includes(plan.status)) {
    if (alarmRuntime.planId === plan.id && alarmRuntime.currentStepOrder !== null) return false;
    // Today's alarm remains active through its wake-confirmation window.
    if (Date.parse(now) <= Date.parse(plan.finalAlarmAt) + ALARM_GRACE_MS) return false;
  }
  const today = localDate(now);
  if (clockTime(now) >= state.automationTime && state.lastAutomationSlot !== today) return true;
  if (!plan) return state.lastPlannedDate !== addDays(today, 1);
  if (plan.status === "COMPLETED" && plan.localDate === today) return false;
  // A just-after-midnight event can have its wake deadline on the day before.
  // Use the event's date to avoid replacing that proposal on every tick.
  const eventDate = plan.eventAt ? localDate(plan.eventAt) : plan.localDate;
  return eventDate <= today;
}
