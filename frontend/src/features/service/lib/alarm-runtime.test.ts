import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const reportApi = vi.hoisted(() => ({
  postAlarmEvent: vi.fn(async () => ({ id: "event" })),
  putWakeLearningEffect: vi.fn(async (_sessionId, _planId, payload) => payload),
  putWakePlanReportContext: vi.fn(async (_sessionId, _planId, payload) => payload),
}));

vi.mock("@/features/wake-report/api/wake-report-api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...reportApi,
}));

vi.mock("./alarm-audio", () => ({
  startAlarmSound: vi.fn(async () => undefined),
  stopAlarmSound: vi.fn(),
}));

vi.mock("@/features/wake-result/lib/wake-learning", () => ({
  applyWakeLearning: vi.fn(async () => ({
    applied: true,
    model: { id: "personal", baseline: {}, parameters: {}, updatedAt: "now" },
    nextRecommendation: "다음 알람을 조정해요.",
    previousAdvanceMinutes: 0,
    nextAdvanceMinutes: 10,
    previousProtocolAdjustment: 0,
    nextProtocolAdjustment: 1,
    reasonCodes: ["RECENT_WAKE_FAILURE"],
  })),
}));

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { localDataStore } from "@/lib/storage/local-data";
import type { ServicePlan } from "../model/service-store";
import { useServiceStore } from "../model/service-store";
import {
  confirmCurrentAlarm,
  dismissCurrentAlarm,
  recordAlarmLifecycleEvent,
  triggerDemoAlarmStep,
} from "./service-actions";

const plan: ServicePlan = {
  id: "00000000-0000-4000-8000-000000000201",
  localDate: "2026-09-21",
  timezone: "Asia/Seoul",
  deadlineAt: "2026-09-21T00:30:00.000Z",
  firstAlarmAt: "2026-09-21T00:00:00.000Z",
  finalAlarmAt: "2026-09-21T00:20:00.000Z",
  importance: "NORMAL",
  protocolLevel: 3,
  steps: [
    { order: 1, offsetMin: 0, channel: "PHONE_SOUND" },
    { order: 2, offsetMin: 10, channel: "PHONE_SOUND" },
    { order: 3, offsetMin: 20, channel: "FINAL_SAFETY" },
  ],
  reasonCodes: ["USER_ALARM_PREFERENCE"],
  requiresApproval: false,
  modelVersion: "test",
  revision: 2,
  status: "APPROVED",
  automatic: false,
  eventTitle: "오전 수업",
  eventAt: "2026-09-21T01:30:00.000Z",
  scheduleTypeLabel: "수업",
  wakeLeadMinutes: 60,
  sleepMinutes: 420,
  reason: "테스트 계획",
  explanationSource: "TEMPLATE",
  fatigueScore: 40,
  fatigueLevel: "MEDIUM",
  aiConfidence: 0.7,
};

beforeEach(async () => {
  vi.clearAllMocks();
  window.localStorage.clear();
  localDataStore.close();
  await localDataStore.clearAll();
  useServiceStore.getState().reset();
  useServiceStore.getState().set({ plan });
  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().startServer({
    sessionId: "00000000-0000-4000-8000-000000000001",
    scenarioId: "regular-class",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
});

describe("sequential alarm runtime", () => {
  it("cancels every remaining alarm after waking on the first step", async () => {
    await triggerDemoAlarmStep();
    await dismissCurrentAlarm();
    await confirmCurrentAlarm(true);

    const state = useServiceStore.getState();
    expect(state.plan?.status).toBe("COMPLETED");
    expect(state.alarmRuntime.completedStepOrders).toEqual([1, 2, 3]);
    expect(state.alarmRuntime.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepOrder: 1, eventType: "CONFIRMED_AWAKE" }),
        expect.objectContaining({ stepOrder: 2, eventType: "CANCELLED" }),
        expect.objectContaining({ stepOrder: 3, eventType: "CANCELLED" }),
      ]),
    );
    expect(useCurrentFlowStore.getState().wakeResult?.alarmStepsUsed).toBe(1);
  });

  it("keeps the plan active after the first miss and runs the next step", async () => {
    await triggerDemoAlarmStep();
    await dismissCurrentAlarm();
    await confirmCurrentAlarm(false);

    expect(useServiceStore.getState().plan?.status).toBe("APPROVED");
    expect(useServiceStore.getState().alarmStage).toBe("idle");

    await triggerDemoAlarmStep();
    expect(useServiceStore.getState().alarmStage).toBe("ringing");
    expect(useServiceStore.getState().alarmRuntime.currentStepOrder).toBe(2);
  });

  it("completes as unconfirmed only after the last step fails", async () => {
    for (const stepOrder of [1, 2, 3]) {
      await triggerDemoAlarmStep();
      expect(useServiceStore.getState().alarmRuntime.currentStepOrder).toBe(stepOrder);
      await dismissCurrentAlarm();
      await confirmCurrentAlarm(false);
    }

    expect(useServiceStore.getState().plan?.status).toBe("COMPLETED");
    expect(useCurrentFlowStore.getState().wakeResult).toMatchObject({
      outcome: "UNCONFIRMED",
      alarmStepsUsed: 3,
    });
    expect(reportApi.putWakeLearningEffect).toHaveBeenCalledWith(
      expect.any(String),
      plan.id,
      expect.objectContaining({
        previousAdvanceMinutes: 0,
        nextAdvanceMinutes: 10,
        previousProtocolAdjustment: 0,
        nextProtocolAdjustment: 1,
        reasonCodes: ["RECENT_WAKE_FAILURE"],
      }),
    );
  });

  it("sends a natural alarm event only once", async () => {
    await recordAlarmLifecycleEvent(plan, 1, "RANG", plan.firstAlarmAt);
    await recordAlarmLifecycleEvent(
      plan,
      1,
      "RANG",
      "2026-09-21T00:00:30.000Z",
    );

    await vi.waitFor(() =>
      expect(reportApi.postAlarmEvent).toHaveBeenCalledTimes(1),
    );
    expect(reportApi.postAlarmEvent).toHaveBeenCalledWith(
      expect.any(String),
      plan.id,
      { stepOrder: 1, eventType: "RANG", occurredAt: plan.firstAlarmAt },
    );
  });
});
