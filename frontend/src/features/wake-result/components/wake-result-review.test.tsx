import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useCurrentFlowStore,
  type ActiveWakePlan,
} from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { localDataStore } from "@/lib/storage/local-data";

import { WakeResultReview } from "./wake-result-review";

const plan: ActiveWakePlan = {
  id: "00000000-0000-4000-8000-000000000030",
  localDate: "2026-09-19",
  timezone: "Asia/Seoul",
  deadlineAt: "2026-09-18T23:00:00.000Z",
  firstAlarmAt: "2026-09-18T22:50:00.000Z",
  finalAlarmAt: "2026-09-18T23:00:00.000Z",
  importance: "IMPORTANT",
  protocolLevel: 2,
  steps: [
    { order: 1, offsetMin: 0, channel: "WATCH_HAPTIC" },
    { order: 2, offsetMin: 10, channel: "FINAL_SAFETY" },
  ],
  reasonCodes: ["IMPORTANT_EVENT"],
  requiresApproval: false,
  modelVersion: "local-wake-0.1",
};

beforeEach(async () => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useCurrentFlowStore.getState().setActiveWakePlan(plan);
  useCurrentFlowStore.getState().setWakeResult({
    alarmStepsUsed: 1,
    completedAt: "2026-09-18T22:55:00.000Z",
    confirmedAt: "2026-09-18T22:55:00.000Z",
    outcome: "CONFIRMED_ON_TIME",
    planId: plan.id,
    userCorrection: false,
  });
  useDemoSessionStore.getState().clear();
  useDemoSessionStore.getState().startLocal("exam-morning");
  localDataStore.close();
  await localDataStore.clearAll();
});

afterEach(cleanup);

describe("WakeResultReview", () => {
  it("shows used alarms and applies one local learning update", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WakeResultReview />
      </QueryClientProvider>,
    );

    expect(screen.getByText("제시간 기상 확인")).toBeInTheDocument();
    expect(screen.getAllByText("1개")).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "결과 확정하고 학습 반영" }),
    );

    expect(await screen.findByText("다음 추천 변화")).toBeInTheDocument();
    expect(
      screen.getByText("결과 원본과 개인 학습값은 이 브라우저에만 저장했습니다."),
    ).toBeInTheDocument();
    const models = await localDataStore.getAll("wake-model");
    expect(models[0].parameters.learningCount).toBe(1);
  });
});
