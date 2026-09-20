import { describe, expect, it } from "vitest";
import { useServiceStore, type ServicePlan } from "../model/service-store";
import { emptyAlarmRuntime } from "./alarm-sequence";
import { shouldGenerateScheduledPlan } from "./plan-lifecycle";

const plan = {
  id: "approved", status: "APPROVED", localDate: "2026-09-21",
  firstAlarmAt: "2026-09-21T07:40:00+09:00", finalAlarmAt: "2026-09-21T08:00:00+09:00",
} as ServicePlan;
const state = { ...useServiceStore.getInitialState(), plan };

describe("scheduled plan lifecycle", () => {
  it("retains a proposal for tomorrow's early event with a deadline tonight", () => {
    const overnight = { ...state, lastAutomationSlot: "2026-09-21", plan: {
      ...plan, status: "PROPOSED" as const, eventAt: "2026-09-22T00:30:00+09:00",
      firstAlarmAt: "2026-09-21T23:20:00+09:00", finalAlarmAt: "2026-09-21T23:30:00+09:00",
    } };
    expect(shouldGenerateScheduledPlan(overnight, "2026-09-21T23:00:00+09:00")).toBe(false);
  });
  it("retains today's approved alarm before ringing and throughout the grace window", () => {
    for (const now of ["2026-09-21T07:39:00+09:00", "2026-09-21T08:15:00+09:00", "2026-09-21T12:00:00+09:00"]) {
      expect(shouldGenerateScheduledPlan(state, now)).toBe(false);
    }
    expect(shouldGenerateScheduledPlan(state, "2026-09-21T12:01:00+09:00")).toBe(true);
  });
  it("retains unanswered wake confirmation even after the grace window", () => {
    const alarmRuntime = { ...emptyAlarmRuntime(plan.id), currentStepOrder: 1, awaitingConfirmationStepOrder: 1 };
    expect(shouldGenerateScheduledPlan({ ...state, alarmRuntime }, "2026-09-22T21:00:00+09:00")).toBe(false);
  });
  it("does not repeatedly request an empty date, but retries failed daily planning", () => {
    const empty = { ...state, plan: null, lastPlannedDate: "2026-09-22", lastAutomationSlot: "2026-09-21" };
    expect(shouldGenerateScheduledPlan(empty, "2026-09-21T21:01:00+09:00")).toBe(false);
    expect(shouldGenerateScheduledPlan({ ...empty, lastAutomationSlot: "2026-09-20" }, "2026-09-21T21:01:00+09:00")).toBe(true);
    expect(shouldGenerateScheduledPlan(empty, "2026-09-22T09:00:00+09:00")).toBe(true);
  });
  it("keeps the completed morning summary until the evening planning time", () => {
    const completed = { ...state, plan: { ...plan, status: "COMPLETED" as const } };
    expect(shouldGenerateScheduledPlan(completed, "2026-09-21T10:00:00+09:00")).toBe(false);
    expect(shouldGenerateScheduledPlan(completed, "2026-09-21T21:00:00+09:00")).toBe(true);
  });
});
