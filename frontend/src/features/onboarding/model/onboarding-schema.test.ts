import { describe, expect, it } from "vitest";

import { onboardingSchema } from "./onboarding-schema";

const validInput = {
  recentFirstAlarmSucceeded: true,
  preferredAlarmCount: 2,
  keepSafetyAlarm: true,
  automationMode: "automatic" as const,
  outcomeSync: false,
};

describe("onboardingSchema", () => {
  it("accepts a complete onboarding input", () => {
    expect(onboardingSchema.parse(validInput)).toEqual(validInput);
  });

  it("rejects invalid alarm counts", () => {
    expect(
      onboardingSchema.safeParse({
        ...validInput,
        preferredAlarmCount: 4,
      }).success,
    ).toBe(false);
  });
});
