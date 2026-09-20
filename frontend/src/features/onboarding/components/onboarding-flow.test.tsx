import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useServiceStore } from "@/features/service/model/service-store";

import { OnboardingFlow } from "./onboarding-flow";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/onboarding",
  useRouter: () => ({ push }),
}));

vi.mock("@/features/service/lib/service-actions", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/service/lib/service-actions")
  >();
  return {
    ...actual,
    generateServicePlan: vi.fn(async () => undefined),
    saveServicePreferences: vi.fn(async () => undefined),
    saveServiceProfile: vi.fn(async () => undefined),
  };
});

beforeEach(() => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useServiceStore.getState().reset();
  push.mockReset();
});

describe("OnboardingFlow", () => {
  it("completes the onboarding flow including data connections", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    expect(screen.getByRole("radio", { name: "예" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(
      screen.getByRole("heading", { name: "일정 유형" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(
      screen.getByRole("heading", { name: "알람 설정" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(
      screen.getByRole("heading", { name: "데이터 연동" }),
    ).toBeInTheDocument();

    useServiceStore
      .getState()
      .set({ calendarConnected: true, healthConnected: true });
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(
      screen.getByRole("heading", { name: "개인정보" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "설정 완료" }));

    expect(useCurrentFlowStore.getState().demoAuthenticated).toBe(true);
    expect(useCurrentFlowStore.getState().onboardingCompleted).toBe(true);
    expect(
      useCurrentFlowStore.getState().onboardingDraft.automationMode,
    ).toBe("suggest");
    expect(push).toHaveBeenCalledWith("/");
  });
});
