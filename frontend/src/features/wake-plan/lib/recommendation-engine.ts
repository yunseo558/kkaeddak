import type { components } from "@kkaeddak/api-client";

import type { HealthInputRecord } from "@/lib/storage/local-data";

type Importance = components["schemas"]["Importance"];
type WakePlanCreate = components["schemas"]["WakePlanCreate"];

export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

export type WakeRecommendation = {
  confidenceBand: ConfidenceBand;
  plan: WakePlanCreate;
};

type RecommendationInput = {
  completedPreparationMinutes: number;
  deadlineAt: string;
  healthInput: HealthInputRecord | null;
  historyProtocolAdjustment?: number;
  importance: Importance;
  maxProtocolLevel: number;
  personalSleepBaselineMinutes?: number;
  preferredFirstChannel: string;
};

const DEFAULT_SLEEP_BASELINE_MINUTES = 420;
const MODEL_VERSION = "local-wake-0.1";
const KOREA_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

function subtractMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() - minutes * 60_000).toISOString();
}

function koreanLocalDate(value: string) {
  return new Date(
    new Date(value).getTime() + KOREA_OFFSET_MILLISECONDS,
  )
    .toISOString()
    .slice(0, 10);
}

export function calculateWakeRecommendation(
  input: RecommendationInput,
): WakeRecommendation {
  const deadline = new Date(input.deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    throw new Error("deadlineAt must be a valid ISO date-time");
  }

  const baseline =
    input.personalSleepBaselineMinutes ?? DEFAULT_SLEEP_BASELINE_MINUTES;
  const health = input.healthInput;
  const reasonCodes: string[] = [];
  const historyProtocolAdjustment = Math.max(
    0,
    Math.min(2, input.historyProtocolAdjustment ?? 0),
  );
  let riskScore = historyProtocolAdjustment;

  if (!health) {
    reasonCodes.push("LOW_MODEL_CONFIDENCE");
    riskScore += 1;
  } else {
    if (
      health.sleepDurationMinutes !== undefined &&
      health.sleepDurationMinutes < baseline - 30
    ) {
      reasonCodes.push("SHORTER_SLEEP_THAN_BASELINE");
      riskScore += 1;
      if (health.sleepDurationMinutes < baseline - 90) riskScore += 1;
    }
    if (health.activityLevel === "high") {
      reasonCodes.push("HIGH_ACTIVITY_DEVIATION");
      riskScore += 1;
    }
    if (health.conditionLevel === "low") {
      riskScore += 1;
    }
    if (health.recentFirstAlarmSucceeded === false) {
      reasonCodes.push("RECENT_FIRST_ALARM_FAILURE");
      riskScore += 1;
    }
  }

  if (input.importance !== "NORMAL") {
    reasonCodes.push("IMPORTANT_EVENT");
    riskScore += 1;
  }
  if (
    historyProtocolAdjustment > 0 &&
    !reasonCodes.includes("RECENT_FIRST_ALARM_FAILURE")
  ) {
    reasonCodes.push("RECENT_FIRST_ALARM_FAILURE");
  }
  if (input.completedPreparationMinutes > 0) {
    reasonCodes.push("PREP_TASKS_COMPLETED");
  }

  const confidenceBand: ConfidenceBand = !health
    ? "LOW"
    : input.personalSleepBaselineMinutes === undefined
      ? "MEDIUM"
      : "HIGH";
  const recommendedLevel = riskScore === 0 ? 1 : riskScore <= 3 ? 2 : 3;
  const protocolLevel = Math.max(
    1,
    Math.min(recommendedLevel, input.maxProtocolLevel),
  );
  const offsets =
    protocolLevel === 1 ? [0] : protocolLevel === 2 ? [0, 10] : [0, 8, 15];
  const channels =
    protocolLevel === 2
      ? [input.preferredFirstChannel, "FINAL_SAFETY"]
      : [input.preferredFirstChannel, "PHONE_SOUND", "FINAL_SAFETY"];
  const lastOffset = offsets[offsets.length - 1];

  return {
    confidenceBand,
    plan: {
      localDate: koreanLocalDate(input.deadlineAt),
      timezone: "Asia/Seoul",
      deadlineAt: input.deadlineAt,
      firstAlarmAt: subtractMinutes(input.deadlineAt, lastOffset),
      finalAlarmAt: input.deadlineAt,
      importance: input.importance,
      protocolLevel,
      steps: offsets.map((offsetMin, index) => ({
        order: index + 1,
        offsetMin,
        channel: channels[index],
      })),
      reasonCodes,
      requiresApproval:
        confidenceBand === "LOW" ||
        riskScore >= 4 ||
        input.importance === "CRITICAL",
      modelVersion: MODEL_VERSION,
    },
  };
}
