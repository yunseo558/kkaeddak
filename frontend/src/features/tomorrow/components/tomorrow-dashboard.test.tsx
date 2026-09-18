import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { TomorrowDashboard } from "./tomorrow-dashboard";

beforeEach(() => {
  window.localStorage.clear();
  useDemoSessionStore.getState().clear();
  useDemoSessionStore.getState().startLocal("exam-morning");
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
});
