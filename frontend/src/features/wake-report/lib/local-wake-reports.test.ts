import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { analysisBadgeCopy } from "@/features/service/components/service-history-detail";
import type { ServicePlan } from "@/features/service/model/service-store";
import { localDataStore } from "@/lib/storage/local-data";
import type { HistoryReportDetail, WakePlanReportContext } from "../api/wake-report-api";
import {
  getLocalWakeReport,
  mergeHistoryReportDetail,
  saveLocalReportContext,
  saveLocalWakeOutcome,
} from "./local-wake-reports";

const plan = {
  id: "00000000-0000-4000-8000-000000000301",
  localDate: "2026-09-21",
  timezone: "Asia/Seoul",
  deadlineAt: "2026-09-21T01:00:00.000Z",
  firstAlarmAt: "2026-09-21T00:00:00.000Z",
  finalAlarmAt: "2026-09-21T00:10:00.000Z",
  importance: "NORMAL",
  protocolLevel: 2,
  steps: [
    { order: 1, offsetMin: 0, channel: "PHONE_SOUND" },
    { order: 2, offsetMin: 10, channel: "FINAL_SAFETY" },
  ],
  reasonCodes: [],
  requiresApproval: true,
  modelVersion: "test",
  revision: 1,
  status: "APPROVED",
  automatic: false,
  eventTitle: "친구와 점심 약속",
  eventAt: "2026-09-21T03:00:00.000Z",
  scheduleTypeLabel: "약속·예약",
  wakeLeadMinutes: 60,
  sleepMinutes: 340,
  reason: "수면과 최근 기록을 반영했어요.",
  explanationSource: "MODEL",
  fatigueScore: 72,
  fatigueLevel: "HIGH",
  aiConfidence: 0.91,
} satisfies ServicePlan;

const context: WakePlanReportContext = {
  schedule: {
    title: plan.eventTitle,
    startsAt: plan.eventAt,
    categoryCode: "APPOINTMENT",
    categoryLabel: plan.scheduleTypeLabel,
    wakeLeadMin: 60,
  },
  healthSummary: null,
  historySignals: {
    recentOnTimeCount: 2,
    recentLateCount: 1,
    recentMissedCount: 0,
    recentAverageAlarmSteps: 1.5,
    learningDays: 6,
    recommendedAdvanceMinutes: 0,
    protocolAdjustment: 0,
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
    explanation: plan.reason,
    source: "MODEL",
    automatic: false,
  },
  policyVersion: "wake-policy-1",
};

beforeEach(async () => {
  localDataStore.close();
  await localDataStore.clearAll();
});

describe("local wake reports", () => {
  it("keeps a date report locally without a server session", async () => {
    await saveLocalReportContext(plan, context);

    const restored = await getLocalWakeReport(plan.localDate);
    expect(restored).toMatchObject({
      localDate: plan.localDate,
      decisionContext: context,
      plan: { id: plan.id },
    });
  });

  it("uses the local outcome when the server report has none", async () => {
    await saveLocalReportContext(plan, context);
    await saveLocalWakeOutcome(plan, {
      planId: plan.id,
      outcome: "CONFIRMED_ON_TIME",
      alarmStepsUsed: 1,
      completedAt: "2026-09-21T00:01:00.000Z",
      confirmedAt: "2026-09-21T00:01:00.000Z",
      userCorrection: true,
    });
    const local = await getLocalWakeReport(plan.localDate);
    const server: HistoryReportDetail = {
      localDate: plan.localDate,
      plan: local!.plan,
      decisionContext: context,
      alarmTimeline: local!.alarmTimeline,
      outcome: null,
      learningEffect: null,
    };

    expect(mergeHistoryReportDetail(server, local)?.outcome).toMatchObject({
      outcome: "CONFIRMED_ON_TIME",
      alarmStepsUsed: 1,
    });
  });

  it("uses clear labels for model and template analysis", () => {
    expect(analysisBadgeCopy("MODEL")).toBe("Gemini 분석");
    expect(analysisBadgeCopy("TEMPLATE")).toBe("안전 폴백");
  });
});
