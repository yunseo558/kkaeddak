import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { createScenarioHealthInput } from "@/features/demo-session/model/scenario-health-input";
import { localDataStore } from "@/lib/storage/local-data";

import { WakePlanReview } from "./wake-plan-review";

beforeEach(async () => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
  useDemoSessionStore.getState().startLocal("exam-morning");
  await localDataStore.clearAll();
  await localDataStore.put(
    "health-inputs",
    createScenarioHealthInput("exam-morning", "2026-09-18T00:00:00.000Z"),
  );
});

afterEach(() => {
  cleanup();
});

describe("WakePlanReview", () => {
  it("renders and approves the local two-step exam recommendation", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WakePlanReview />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "내일 기상 계획" });
    expect(screen.getByText("2단계")).toBeInTheDocument();
    const timeline = screen.getByRole("heading", {
      name: "알람 타임라인",
    }).parentElement;
    expect(within(timeline as HTMLElement).getAllByRole("listitem")).toHaveLength(
      2,
    );
    expect(
      screen.getByText(/평소보다 수면시간이 짧았습니다/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "이 계획 승인" }));

    expect(await screen.findByText("계획 상태: 승인됨")).toBeInTheDocument();
    expect(useCurrentFlowStore.getState().editingPlanId).toBe(
      "00000000-0000-4000-8000-000000000030",
    );
    expect(useCurrentFlowStore.getState().activeWakePlan).toMatchObject({
      id: "00000000-0000-4000-8000-000000000030",
      protocolLevel: 2,
    });
    expect(
      screen.getByRole("link", { name: "기상 실행 시작" }),
    ).toHaveAttribute("href", "/wake");
  });

  it("validates and saves an edited alarm window", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WakePlanReview />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "내일 기상 계획" });
    await user.click(screen.getByRole("button", { name: "시각 수정" }));
    fireEvent.change(screen.getByLabelText("첫 알람"), {
      target: { value: "07:45" },
    });
    fireEvent.change(screen.getByLabelText("최종 알람"), {
      target: { value: "07:55" },
    });
    await user.click(screen.getByRole("button", { name: "수정 저장" }));

    expect(
      await screen.findByText("계획 상태: 수정 저장됨"),
    ).toBeInTheDocument();
    expect(screen.getByText("07:45")).toBeInTheDocument();
    expect(screen.getByText("07:55")).toBeInTheDocument();
  });
});
