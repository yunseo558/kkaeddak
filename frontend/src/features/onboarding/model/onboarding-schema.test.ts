import { describe, expect, it } from "vitest";

import { onboardingSchema } from "./onboarding-schema";

const validInput = {
  usualWakeTime: "07:00",
  recentFirstAlarmSucceeded: true,
  washMinutes: 20,
  breakfastMinutes: 15,
  bagMinutes: 10,
  preferredAlarmCount: 2,
  keepSafetyAlarm: true,
  automationMode: "suggest" as const,
  outcomeSync: false,
};

describe("onboardingSchema", () => {
  it("accepts a complete four-step onboarding input", () => {
    expect(onboardingSchema.parse(validInput)).toEqual(validInput);
  });

  it("rejects invalid time and routine duration values", () => {
    expect(
      onboardingSchema.safeParse({
        ...validInput,
        usualWakeTime: "25:00",
        washMinutes: -1,
      }).success,
    ).toBe(false);
  });
});
