import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { ApiErrorState } from "./api-error-state";

beforeEach(() => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
});

describe("ApiErrorState", () => {
  it("clears only the expired server session and preserves local flow data", async () => {
    const user = userEvent.setup();
    useCurrentFlowStore.getState().setOnboardingCompleted(true);
    useDemoSessionStore.getState().startServer({
      expiresAt: "2026-09-19T00:00:00.000Z",
      scenarioId: "exam-morning",
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ApiErrorState
          error={{ status: 401 }}
          onRetry={vi.fn()}
          title="세션 오류"
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("link", { name: "내일 상황 다시 선택" }));
    expect(useDemoSessionStore.getState().sessionId).toBeNull();
    expect(useCurrentFlowStore.getState().onboardingCompleted).toBe(true);
  });

  it("offers an explicit retry for a revision conflict", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApiErrorState
          error={{ status: 409 }}
          onRetry={retry}
          title="저장 충돌"
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
