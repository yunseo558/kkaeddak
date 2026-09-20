import { describe, expect, it } from "vitest";

import { onboardingSchema } from "./onboarding-schema";

const validInput = {
  usualWakeTime: "07:00",
  recentFirstAlarmSucceeded: true,
  preferredAlarmCount: 2,
  keepSafetyAlarm: true,
  automationMode: "automatic" as const,
  aiPersonalizationConsent: true,
  outcomeSync: false,
};

describe("onboardingSchema", () => {
  it("accepts a complete four-step onboarding input", () => {
    expect(onboardingSchema.parse(validInput)).toEqual(validInput);
  });

  it("rejects invalid time and alarm count values", () => {
    expect(
      onboardingSchema.safeParse({
        ...validInput,
        usualWakeTime: "25:00",
        preferredAlarmCount: 4,
      }).success,
    ).toBe(false);
  });

  it("requires explicit AI personalization consent", () => {
    expect(
      onboardingSchema.safeParse({
        ...validInput,
        aiPersonalizationConsent: false,
      }).success,
    ).toBe(false);
  });
});
