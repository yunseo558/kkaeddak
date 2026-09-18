import { describe, expect, it } from "vitest";

import { createScenarioHealthInput } from "@/features/demo-session/model/scenario-health-input";

import { calculateWakeRecommendation } from "./recommendation-engine";

const baseInput = {
  completedPreparationMinutes: 0,
  deadlineAt: "2026-09-18T23:00:00.000Z",
  importance: "NORMAL" as const,
  maxProtocolLevel: 4,
  preferredFirstChannel: "WATCH_HAPTIC",
};

describe("calculateWakeRecommendation", () => {
  it("keeps a regular successful morning to one haptic step", () => {
    const result = calculateWakeRecommendation({
      ...baseInput,
      healthInput: createScenarioHealthInput("regular-class"),
    });

    expect(result.confidenceBand).toBe("MEDIUM");
    expect(result.plan).toMatchObject({
      protocolLevel: 1,
      firstAlarmAt: baseInput.deadlineAt,
      finalAlarmAt: baseInput.deadlineAt,
      reasonCodes: [],
      requiresApproval: false,
      steps: [{ order: 1, offsetMin: 0, channel: "WATCH_HAPTIC" }],
    });
  });

  it("creates the documented two-step exam plan with a safety alarm", () => {
    const result = calculateWakeRecommendation({
      ...baseInput,
      importance: "IMPORTANT",
      healthInput: createScenarioHealthInput("exam-morning"),
    });

    expect(result.plan.protocolLevel).toBe(2);
    expect(result.plan.steps).toEqual([
      { order: 1, offsetMin: 0, channel: "WATCH_HAPTIC" },
      { order: 2, offsetMin: 10, channel: "FINAL_SAFETY" },
    ]);
    expect(result.plan.reasonCodes).toEqual([
      "SHORTER_SLEEP_THAN_BASELINE",
      "RECENT_FIRST_ALARM_FAILURE",
      "IMPORTANT_EVENT",
    ]);
    expect(result.plan.requiresApproval).toBe(false);
  });

  it("requires approval for the high-deviation tired interview", () => {
    const result = calculateWakeRecommendation({
      ...baseInput,
      completedPreparationMinutes: 25,
      importance: "IMPORTANT",
      healthInput: createScenarioHealthInput("tired-interview"),
    });

    expect(result.plan.protocolLevel).toBe(3);
    expect(result.plan.steps.at(-1)).toEqual({
      order: 3,
      offsetMin: 15,
      channel: "FINAL_SAFETY",
    });
    expect(result.plan.reasonCodes).toContain("PREP_TASKS_COMPLETED");
    expect(result.plan.requiresApproval).toBe(true);
  });

  it("uses a low-confidence safe plan when health input is unavailable", () => {
    const result = calculateWakeRecommendation({
      ...baseInput,
      healthInput: null,
    });

    expect(result.confidenceBand).toBe("LOW");
    expect(result.plan.reasonCodes).toContain("LOW_MODEL_CONFIDENCE");
    expect(result.plan.requiresApproval).toBe(true);
  });
});
