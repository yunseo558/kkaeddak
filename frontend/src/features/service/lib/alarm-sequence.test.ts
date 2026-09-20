import { describe, expect, it } from "vitest";

import type { ServicePlan } from "../model/service-store";
import {
  alarmScheduledAt,
  emptyAlarmRuntime,
  nextAlarmStep,
  queueAlarmEvent,
} from "./alarm-sequence";

const plan = {
  id: "00000000-0000-4000-8000-000000000101",
  status: "APPROVED",
  firstAlarmAt: "2026-09-21T00:00:00.000Z",
  finalAlarmAt: "2026-09-21T00:20:00.000Z",
  steps: [
    { order: 1, offsetMin: 0, channel: "PHONE_SOUND" },
    { order: 2, offsetMin: 10, channel: "PHONE_SOUND" },
    { order: 3, offsetMin: 20, channel: "FINAL_SAFETY" },
  ],
} as ServicePlan;

describe("alarm sequence", () => {
  it("calculates each scheduled time from the first alarm and offset", () => {
    expect(alarmScheduledAt(plan, 2)).toBe("2026-09-21T00:10:00.000Z");
  });

  it("moves to the next due step after a failed step", () => {
    const runtime = {
      ...emptyAlarmRuntime(plan.id),
      completedStepOrders: [1],
    };
    expect(
      nextAlarmStep(plan, runtime, "2026-09-21T00:10:00.000Z")?.order,
    ).toBe(2);
  });

  it("does not queue the same plan, step and event twice", () => {
    const initial = emptyAlarmRuntime(plan.id);
    const once = queueAlarmEvent(initial, {
      planId: plan.id,
      stepOrder: 1,
      eventType: "RANG",
      occurredAt: "2026-09-21T00:00:00.000Z",
    });
    const twice = queueAlarmEvent(once, {
      planId: plan.id,
      stepOrder: 1,
      eventType: "RANG",
      occurredAt: "2026-09-21T00:00:30.000Z",
    });

    expect(twice.events).toHaveLength(1);
    expect(twice.events[0].occurredAt).toBe("2026-09-21T00:00:00.000Z");
  });
});
