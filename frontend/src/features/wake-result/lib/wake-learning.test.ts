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
      learningCount: 1,
      protocolAdjustment: 1,
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
});
