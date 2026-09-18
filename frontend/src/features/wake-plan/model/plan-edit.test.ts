import { describe, expect, it } from "vitest";

import { createPlanEditSchema, koreanLocalTimeToUtc } from "./plan-edit";

describe("wake plan edit", () => {
  it("accepts ordered alarm times before the deadline", () => {
    expect(
      createPlanEditSchema("08:00").safeParse({
        firstAlarmTime: "07:45",
        finalAlarmTime: "07:55",
      }).success,
    ).toBe(true);
  });

  it("rejects reversed or late alarm times", () => {
    const schema = createPlanEditSchema("08:00");
    expect(
      schema.safeParse({
        firstAlarmTime: "07:55",
        finalAlarmTime: "07:45",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        firstAlarmTime: "07:50",
        finalAlarmTime: "08:10",
      }).success,
    ).toBe(false);
  });

  it("converts a Korean local time to the UTC API contract", () => {
    expect(koreanLocalTimeToUtc("2026-09-19", "08:00")).toBe(
      "2026-09-18T23:00:00.000Z",
    );
  });
});
