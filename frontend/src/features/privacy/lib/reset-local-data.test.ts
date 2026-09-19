import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { resetLocalData } from "./reset-local-data";

beforeEach(() => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
});

describe("resetLocalData", () => {
  it("clears the private stores and all current flow state", async () => {
    const clearAll = vi.fn().mockResolvedValue(undefined);
    useCurrentFlowStore.getState().setOnboardingStep(2);
    useCurrentFlowStore.getState().setOnboardingCompleted(true);
    useDemoSessionStore.getState().startLocal("exam-morning");

    await resetLocalData({ clearAll });

    expect(clearAll).toHaveBeenCalledOnce();
    expect(useCurrentFlowStore.getState().onboardingCompleted).toBe(false);
    expect(useCurrentFlowStore.getState().demoAuthenticated).toBe(false);
    expect(useCurrentFlowStore.getState().onboardingStep).toBe(0);
    expect(useDemoSessionStore.getState().scenarioId).toBeNull();
    expect(window.localStorage.getItem("kkaeddak-current-flow")).toBeNull();
    expect(window.localStorage.getItem("kkaeddak-demo-session")).toBeNull();
  });
});
