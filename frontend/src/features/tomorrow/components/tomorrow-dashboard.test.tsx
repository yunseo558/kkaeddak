import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { TomorrowDashboard } from "./tomorrow-dashboard";

const originalOnlineDescriptor = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "onLine",
);

beforeEach(() => {
  window.localStorage.clear();
  useDemoSessionStore.getState().clear();
  useDemoSessionStore.getState().startLocal("exam-morning");
});

afterEach(() => {
  cleanup();
  if (originalOnlineDescriptor) {
    Object.defineProperty(
      Navigator.prototype,
      "onLine",
      originalOnlineDescriptor,
    );
  }
});

describe("TomorrowDashboard", () => {
  it("shows the first event and its routine-only wake deadline", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TomorrowDashboard />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "오전 시험", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("일정 부담 보통")).toBeInTheDocument();
  });

  it("keeps schedule calculation local when a server session goes offline", async () => {
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => false,
    });
    useDemoSessionStore.getState().startServer({
      expiresAt: "2026-09-19T00:00:00.000Z",
      scenarioId: "exam-morning",
      sessionId: "00000000-0000-4000-8000-000000000001",
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TomorrowDashboard />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("오프라인 로컬 계산")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "오프라인 상태입니다. 로컬 기능은 계속 사용할 수 있고 서버 동기화는 연결 후 다시 시도합니다.",
    );
  });
});
