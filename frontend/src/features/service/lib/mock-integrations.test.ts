import { describe, expect, it } from "vitest";

import {
  createHealthKitMockSnapshot,
  normalizeHealthKitSnapshot,
} from "./mock-integrations";

describe("HealthKit demo adapter", () => {
  it("creates HealthKit-shaped category and quantity samples", () => {
    const snapshot = createHealthKitMockSnapshot({
      now: "2026-09-20T00:00:00.000Z",
      sleepMinutes: 420,
    });

    expect(snapshot.categorySamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampleType: "HKCategorySample",
          typeIdentifier: "HKCategoryTypeIdentifierSleepAnalysis",
        }),
        expect.objectContaining({
          sampleType: "HKCategorySample",
          typeIdentifier: "HKCategoryTypeIdentifierMenstrualFlow",
        }),
      ]),
    );
    expect(snapshot.quantitySamples.map((sample) => sample.typeIdentifier)).toEqual(
      expect.arrayContaining([
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierActiveEnergyBurned",
        "HKQuantityTypeIdentifierAppleExerciseTime",
      ]),
    );
  });

  it("normalizes raw-shaped samples through the common planner contract", () => {
    const now = "2026-09-20T00:00:00.000Z";
    const normalized = normalizeHealthKitSnapshot(
      createHealthKitMockSnapshot({ now, sleepMinutes: 300 }),
      { now, recentFirstAlarmSucceeded: false },
    );

    expect(normalized).toMatchObject({
      source: "sample",
      sleepDurationMinutes: 300,
      stepCount: 12_480,
      activeEnergyKcal: 690,
      exerciseMinutes: 64,
      menstrualCycleDay: 18,
      menstrualCyclePhase: "luteal",
      activityLevel: "high",
      conditionLevel: "low",
      recentFirstAlarmSucceeded: false,
    });
  });
});
