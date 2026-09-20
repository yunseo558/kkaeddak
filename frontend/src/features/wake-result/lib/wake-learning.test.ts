import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import type { WakeResult } from "@/features/current-flow/model/current-flow-store";
import { localDataStore } from "@/lib/storage/local-data";

import { applyWakeLearning } from "./wake-learning";

const lateResult: WakeResult = {
  alarmStepsUsed: 2,
  completedAt: "2026-09-18T23:05:00.000Z",
  confirmedAt: "2026-09-18T23:05:00.000Z",
  outcome: "CONFIRMED_LATE",
  planId: "00000000-0000-4000-8000-000000000030",
  userCorrection: false,
};

const failedResult: WakeResult = {
  alarmStepsUsed: 3,
  completedAt: "2026-09-19T23:05:00.000Z",
  confirmedAt: null,
  outcome: "UNCONFIRMED",
  planId: "00000000-0000-4000-8000-000000000031",
  userCorrection: true,
};

const successfulResult: WakeResult = {
  alarmStepsUsed: 1,
  completedAt: "2026-09-20T23:05:00.000Z",
  confirmedAt: "2026-09-20T23:05:00.000Z",
  outcome: "CONFIRMED_ON_TIME",
  planId: "00000000-0000-4000-8000-000000000032",
  userCorrection: true,
};

beforeEach(async () => {
  localDataStore.close();
  await localDataStore.clearAll();
});

describe("applyWakeLearning", () => {
  it("raises the next protocol adjustment after a late confirmation", async () => {
    const learned = await applyWakeLearning(lateResult, "2026-09-19");

    expect(learned.applied).toBe(true);
    expect(learned.model.parameters).toMatchObject({
      averageAlarmSteps: 2,
      confirmedLateCount: 1,
      consecutiveFailureCount: 1,
      learningCount: 1,
      protocolAdjustment: 1,
      recommendedAdvanceMinutes: 5,
    });
    expect(await localDataStore.getAll("wake-events")).toEqual([
      expect.objectContaining({
        eventType: "OUTCOME_RECORDED",
        outcome: "CONFIRMED_LATE",
      }),
    ]);
  });

  it("does not learn the same completed result twice", async () => {
    await applyWakeLearning(lateResult, "2026-09-19");
    const repeated = await applyWakeLearning(lateResult, "2026-09-19");

    expect(repeated.applied).toBe(false);
    expect(repeated.model.parameters.learningCount).toBe(1);
  });

  it("starts earlier after failures and eases after a first-alarm success", async () => {
    await applyWakeLearning(lateResult, "2026-09-19");
    const failed = await applyWakeLearning(failedResult, "2026-09-20");
    const recovered = await applyWakeLearning(successfulResult, "2026-09-21");

    expect(failed.model.parameters).toMatchObject({
      averageAlarmSteps: 2.5,
      consecutiveFailureCount: 2,
      protocolAdjustment: 2,
      recommendedAdvanceMinutes: 15,
    });
    expect(recovered.model.parameters).toMatchObject({
      consecutiveFailureCount: 0,
      consecutiveFirstAlarmSuccesses: 1,
      protocolAdjustment: 1,
      recommendedAdvanceMinutes: 10,
    });
  });
});
