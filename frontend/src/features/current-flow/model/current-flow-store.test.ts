import { beforeEach, describe, expect, it } from "vitest";
import { useServiceStore } from "@/features/service/model/service-store";
import { useCurrentFlowStore } from "./current-flow-store";

beforeEach(() => {
  localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useServiceStore.getState().reset();
});

describe("persisted demo preferences", () => {
  it("removes the unused wake time while retaining the user's existing preferences", async () => {
    const draft = {
      ...useCurrentFlowStore.getState().onboardingDraft,
      usualWakeTime: "08:30",
      preferredAlarmCount: 3,
      automationMode: "automatic",
      outcomeSync: true,
    };
    localStorage.setItem("kkaeddak-current-flow", JSON.stringify({
      version: 4,
      state: { onboardingDraft: draft, onboardingCompleted: true },
    }));
    await useCurrentFlowStore.persist.rehydrate();
    expect(useCurrentFlowStore.getState().onboardingDraft).toEqual({
      recentFirstAlarmSucceeded: true,
      preferredAlarmCount: 3,
      keepSafetyAlarm: true,
      automationMode: "automatic",
      outcomeSync: true,
    });
    expect(useCurrentFlowStore.getState().onboardingCompleted).toBe(true);
    expect(localStorage.getItem("kkaeddak-current-flow")).not.toContain("usualWakeTime");
  });

  it("defaults old service sessions to the regular sleep sample without resetting settings", async () => {
    localStorage.setItem("kkaeddak-service", JSON.stringify({
      version: 0,
      state: { preferredAlarmCount: 3, sleepMinutes: 300, automationTime: "22:00" },
    }));
    await useServiceStore.persist.rehydrate();
    expect(useServiceStore.getState()).toMatchObject({
      sleepPattern: "regular", preferredAlarmCount: 3,
      sleepMinutes: 300, automationTime: "22:00",
    });
  });
});
