import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";

import { OnboardingFlow } from "./onboarding-flow";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  push.mockReset();
});

describe("OnboardingFlow", () => {
  it("completes only the four documented onboarding steps", async () => {
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
      screen.getByRole("heading", { name: "개인정보" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "설정 완료" }));

    expect(useCurrentFlowStore.getState().onboardingCompleted).toBe(true);
    expect(push).toHaveBeenCalledWith("/calendar");
  });
});
