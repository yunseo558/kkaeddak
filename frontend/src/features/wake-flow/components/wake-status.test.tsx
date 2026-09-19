import "fake-indexeddb/auto";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useCurrentFlowStore,
  type ActiveWakePlan,
} from "@/features/current-flow/model/current-flow-store";
import { localDataStore } from "@/lib/storage/local-data";

import { WakeStatus } from "./wake-status";

const plan: ActiveWakePlan = {
  id: "00000000-0000-4000-8000-000000000030",
  localDate: "2099-09-19",
  timezone: "Asia/Seoul",
  deadlineAt: "2099-09-18T23:00:00.000Z",
  firstAlarmAt: "2099-09-18T22:50:00.000Z",
  finalAlarmAt: "2099-09-18T23:00:00.000Z",
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
  localDataStore.close();
  await localDataStore.clearAll();
});

afterEach(cleanup);

describe("WakeStatus", () => {
  it("runs every documented state and escalates in plan order", async () => {
    const user = userEvent.setup();
    render(<WakeStatus />);

    expect(screen.getByText("알람 실행 중")).toBeInTheDocument();
    const dismissButton = screen.getByRole("button", { name: "알람 종료" });
    dismissButton.focus();
    expect(dismissButton).toHaveFocus();
    await user.keyboard("[Enter]");

    expect(await screen.findByText("알람 종료됨")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 잠든 것 같아요" }));
    expect(await screen.findByText("조건부 알람")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다음 알람 실행" }));
    expect(await screen.findByText("2 / 2 단계")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "알람 종료" }));
    await user.click(await screen.findByRole("button", { name: "기상 활동 시작" }));
    expect(await screen.findByText("활동 확인 중")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "기상 완료 확인" }));

    expect(await screen.findByText("기상 확인 완료")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기상 결과 보기" })).toHaveAttribute(
      "href",
      "/result",
    );
    expect(useCurrentFlowStore.getState().wakeResult).toMatchObject({
      alarmStepsUsed: 2,
      outcome: "CONFIRMED_ON_TIME",
      planId: plan.id,
    });
  });
});
