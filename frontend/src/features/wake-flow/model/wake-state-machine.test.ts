import { describe, expect, it } from "vitest";

import type { ActiveWakePlan } from "@/features/current-flow/model/current-flow-store";

import {
  createConfirmedWakeResult,
  createInitialWakeMachine,
  hasNextAlarm,
  transitionWakeMachine,
} from "./wake-state-machine";

const plan: ActiveWakePlan = {
  id: "00000000-0000-4000-8000-000000000030",
  localDate: "2026-09-19",
  timezone: "Asia/Seoul",
  deadlineAt: "2026-09-18T23:00:00.000Z",
  firstAlarmAt: "2026-09-18T22:50:00.000Z",
  finalAlarmAt: "2026-09-18T23:00:00.000Z",
  importance: "IMPORTANT",
  protocolLevel: 2,
  steps: [
    { order: 1, offsetMin: 0, channel: "WATCH_HAPTIC" },
    { order: 2, offsetMin: 10, channel: "FINAL_SAFETY" },
  ],
  reasonCodes: ["IMPORTANT_EVENT"],
  requiresApproval: false,
  modelVersion: "local-wake-0.1",
};

describe("wake state machine", () => {
  it("moves through dismissal and activity to confirmed", () => {
    let state = createInitialWakeMachine();
    state = transitionWakeMachine(state, { type: "DISMISS_ALARM" }, 2);
    expect(state).toMatchObject({ name: "DISMISSED", alarmStepsUsed: 1 });
    state = transitionWakeMachine(state, { type: "START_ACTIVITY" }, 2);
    expect(state.name).toBe("ACTIVE_CANDIDATE");
    state = transitionWakeMachine(state, { type: "CONFIRM_WAKE" }, 2);
    expect(state.name).toBe("CONFIRMED");
  });

  it("escalates to the next conditional alarm without skipping a step", () => {
    let state = transitionWakeMachine(
      createInitialWakeMachine(),
      { type: "DISMISS_ALARM" },
      2,
    );
    state = transitionWakeMachine(state, { type: "SUSPECT_RESLEEP" }, 2);
    expect(state.name).toBe("ESCALATING");
    expect(hasNextAlarm(state, 2)).toBe(true);
    state = transitionWakeMachine(
      state,
      { type: "TRIGGER_NEXT_ALARM" },
      2,
    );
    expect(state).toMatchObject({ name: "RINGING", currentStepIndex: 1 });
    state = transitionWakeMachine(state, { type: "DISMISS_ALARM" }, 2);
    expect(state.alarmStepsUsed).toBe(2);
  });

  it("creates an aggregate on-time result without local event details", () => {
    const result = createConfirmedWakeResult(
      plan,
      { alarmStepsUsed: 1, currentStepIndex: 0, name: "CONFIRMED" },
      "2026-09-18T22:55:00.000Z",
    );

    expect(result).toEqual({
      alarmStepsUsed: 1,
      completedAt: "2026-09-18T22:55:00.000Z",
      confirmedAt: "2026-09-18T22:55:00.000Z",
      outcome: "CONFIRMED_ON_TIME",
      planId: plan.id,
      userCorrection: false,
    });
  });
});
