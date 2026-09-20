import { describe, expect, it } from "vitest";
import type { HealthInputRecord } from "@/lib/storage/local-data";
import { calculateWakeRecommendation } from "@/features/wake-plan/lib/recommendation-engine";
import { calculateSleepBaseline, createSleepHistory } from "./sleep-baseline";

const now = "2026-09-20T00:00:00Z";

describe("sample sleep baseline", () => {
  it("uses varied, repeatable past nights and separates habitual sleep from today's sleep", () => {
    const history = createSleepHistory(now, "regular");
    expect(history).toEqual(createSleepHistory(now, "regular"));
    expect(new Set(history.map((record) => record.sleepDurationMinutes)).size).toBeGreaterThan(5);
    expect(history.every((record) => record.source === "sample" && Date.parse(record.updatedAt) < Date.parse(now))).toBe(true);
    const shorter = calculateSleepBaseline(createSleepHistory(now, "shorter"), now);
    const longer = calculateSleepBaseline(createSleepHistory(now, "longer"), now);
    expect(shorter.nightCount).toBe(14);
    expect(longer.minutes! - shorter.minutes!).toBe(120);

    const healthInput: HealthInputRecord = {
      id: "today", source: "sample", updatedAt: now,
      sleepDurationMinutes: 420, activityLevel: "usual", conditionLevel: "usual",
      recentFirstAlarmSucceeded: true,
    };
    const recommend = (baseline: number) => calculateWakeRecommendation({
      completedPreparationMinutes: 0,
      deadlineAt: "2026-09-21T01:00:00Z",
      importance: "NORMAL", maxProtocolLevel: 3,
      preferredFirstChannel: "PHONE_SOUND", healthInput,
      personalSleepBaselineMinutes: baseline,
    });
    expect(recommend(shorter.minutes!).plan.reasonCodes).not.toContain("SHORTER_SLEEP_THAN_BASELINE");
    expect(recommend(longer.minutes!).plan.reasonCodes).toContain("SHORTER_SLEEP_THAN_BASELINE");
    expect(recommend(longer.minutes!).plan.steps.length).toBeGreaterThan(recommend(shorter.minutes!).plan.steps.length);
  });

  it("excludes today's sleep, future/old/invalid nights and counts each date once", () => {
    const history = createSleepHistory(now, "regular");
    const expected = calculateSleepBaseline(history, now);
    const first = history[0];
    const noise = [
      { ...first, id: "today", updatedAt: now, sleepDurationMinutes: 180 },
      { ...first, id: "future", updatedAt: "2026-09-21T00:00:00Z" },
      { ...first, id: "old", updatedAt: "2026-09-01T00:00:00Z" },
      { ...first, id: "invalid-date", updatedAt: "invalid" },
      { ...first, id: "invalid-minutes", sleepDurationMinutes: NaN },
      { ...first, id: "out-of-range", sleepDurationMinutes: 1000 },
      { ...first, id: "duplicate" },
    ];
    expect(calculateSleepBaseline([...history, ...noise], now)).toEqual(expected);
    expect(calculateSleepBaseline([...history.slice(0, 6), ...noise], now)).toEqual({ nightCount: 6, minutes: null });
  });

  it("uses a median so one unusually long night does not distort the baseline", () => {
    const history = createSleepHistory(now, "regular").slice(0, 7)
      .map((record, index) => ({ ...record, sleepDurationMinutes: index === 0 ? 700 : 400 }));
    expect(calculateSleepBaseline(history, now)).toEqual({ nightCount: 7, minutes: 400 });
  });
});
