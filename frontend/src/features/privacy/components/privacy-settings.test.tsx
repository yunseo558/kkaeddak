import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { PrivacySettings } from "./privacy-settings";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/privacy",
  useRouter: () => ({ replace: vi.fn() }),
}));

beforeEach(() => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
  useDemoSessionStore.getState().startLocal("exam-morning");
});

describe("PrivacySettings", () => {
  it("requires an explicit save action for the local outcome consent", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PrivacySettings />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /집계 결과 서버 동기화 허용/ }),
    );
    await user.click(screen.getByRole("button", { name: "동기화 설정 저장" }));

    expect(useCurrentFlowStore.getState().onboardingDraft.outcomeSync).toBe(true);
    expect(
      await screen.findByText("로컬 동의 설정을 저장했습니다."),
    ).toBeInTheDocument();
  });
});
