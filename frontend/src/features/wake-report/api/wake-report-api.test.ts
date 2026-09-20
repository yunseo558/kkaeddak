import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  PUT: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiClient: client }));

import { createWakePlanReportContext } from "../lib/report-context";
import {
  putWakeLearningEffect,
  putWakePlanReportContext,
  type WakeLearningEffect,
} from "./wake-report-api";

const sessionId = "00000000-0000-4000-8000-000000000001";
const planId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  client.PUT.mockReset();
});

describe("wake report API", () => {
  it("sends the exact privacy-limited decision context after plan creation", async () => {
    const payload = createWakePlanReportContext({
      schedule: {
        title: "친구와 점심 약속",
        startsAt: "2026-09-21T03:00:00.000Z",
        categoryCode: "APPOINTMENT",
        categoryLabel: "약속·예약",
        wakeLeadMin: 60,
      },
      healthSummary: {
        restMinutes: 340,
        usualRestMinutes: 420,
        activityLevel: "high",
        conditionLevel: "low",
      },
      historySignals: {
        recentOnTimeCount: 2,
        recentLateCount: 1,
        recentMissedCount: 1,
        recentAverageAlarmSteps: 2.5,
        learningDays: 6,
        recommendedAdvanceMinutes: 10,
        protocolAdjustment: 1,
      },
      alarmPreferences: {
        preferredAlarmCount: 2,
        preferredIntervalMin: 10,
        keepSafetyAlarm: true,
      },
      personalization: {
        fatigueScore: 72,
        fatigueLevel: "HIGH",
        confidence: 0.91,
        explanation: "수면과 최근 기록을 반영했어요.",
        source: "MODEL",
        automatic: false,
      },
    });
    client.PUT.mockResolvedValue({ data: payload, error: undefined, response: { status: 200 } });

    await putWakePlanReportContext(sessionId, planId, payload);

    expect(client.PUT).toHaveBeenCalledWith(
      "/api/v1/wake-plans/{plan_id}/report-context",
      expect.objectContaining({
        params: { path: { plan_id: planId } },
        body: payload,
      }),
    );
    expect(payload).not.toHaveProperty("stepCount");
    expect(payload).not.toHaveProperty("sleepStages");
  });

  it("sends the actual before and after learning values", async () => {
    const payload: WakeLearningEffect = {
      previousAdvanceMinutes: 5,
      nextAdvanceMinutes: 15,
      previousProtocolAdjustment: 1,
      nextProtocolAdjustment: 2,
      recommendation: "다음 첫 알람을 10분 앞당기고 안전 단계를 강화합니다.",
      reasonCodes: ["RECENT_WAKE_FAILURE"],
      policyVersion: "wake-learning-1",
    };
    client.PUT.mockResolvedValue({ data: payload, error: undefined, response: { status: 200 } });

    await putWakeLearningEffect(sessionId, planId, payload);

    expect(client.PUT).toHaveBeenCalledWith(
      "/api/v1/wake-plans/{plan_id}/learning-effect",
      expect.objectContaining({ body: payload }),
    );
  });
});
