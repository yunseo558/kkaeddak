import type { WakeResult } from "@/features/current-flow/model/current-flow-store";
import { recordWakeOutcome } from "@/features/wake-flow/lib/wake-event-log";
import {
  localDataStore,
  type WakeModelRecord,
} from "@/lib/storage/local-data";

export type WakeLearningResult = {
  applied: boolean;
  model: WakeModelRecord;
  nextRecommendation: string;
};

function nextProtocolAdjustment(
  current: number,
  result: WakeResult,
) {
  if (result.outcome === "CONFIRMED_ON_TIME" && result.alarmStepsUsed <= 1) {
    return Math.max(0, current - 1);
  }
  if (
    result.outcome === "CONFIRMED_LATE" ||
    result.outcome === "UNCONFIRMED"
  ) {
    return Math.min(2, current + 1);
  }
  return current;
}

function recommendationCopy(result: WakeResult, adjustment: number) {
  if (result.outcome === "CONFIRMED_ON_TIME" && result.alarmStepsUsed <= 1) {
    return "첫 알람 성공을 반영해 다음 계획은 최소 단계를 우선합니다.";
  }
  if (adjustment > 0) {
    return "재수면 또는 지연 기록을 반영해 다음 계획의 안전 단계를 강화합니다.";
  }
  return "사용한 알람 단계를 반영해 다음 계획의 현재 강도를 유지합니다.";
}

export async function applyWakeLearning(
  result: WakeResult,
  localDate: string,
): Promise<WakeLearningResult> {
  const [events, models] = await Promise.all([
    localDataStore.getAll("wake-events"),
    localDataStore.getAll("wake-model"),
  ]);
  const outcomeId = `outcome:${result.planId}:${result.completedAt}`;
  const existing = models.find((model) => model.id === "personal");
  if (events.some((event) => event.id === outcomeId) && existing) {
    return {
      applied: false,
      model: existing,
      nextRecommendation: recommendationCopy(
        result,
        existing.parameters.protocolAdjustment ?? 0,
      ),
    };
  }

  const parameters = existing?.parameters ?? {};
  const learningCount = parameters.learningCount ?? 0;
  const previousAverage = parameters.averageAlarmSteps ?? 0;
  const protocolAdjustment = nextProtocolAdjustment(
    parameters.protocolAdjustment ?? 0,
    result,
  );
  const model: WakeModelRecord = {
    id: "personal",
    baseline: existing?.baseline ?? {},
    parameters: {
      ...parameters,
      averageAlarmSteps:
        (previousAverage * learningCount + result.alarmStepsUsed) /
        (learningCount + 1),
      confirmedLateCount:
        (parameters.confirmedLateCount ?? 0) +
        Number(result.outcome === "CONFIRMED_LATE"),
      confirmedOnTimeCount:
        (parameters.confirmedOnTimeCount ?? 0) +
        Number(result.outcome === "CONFIRMED_ON_TIME"),
      learningCount: learningCount + 1,
      protocolAdjustment,
      unconfirmedCount:
        (parameters.unconfirmedCount ?? 0) +
        Number(result.outcome === "UNCONFIRMED"),
    },
    updatedAt: result.completedAt,
  };

  await localDataStore.put("wake-model", model);
  await recordWakeOutcome(result, localDate);

  return {
    applied: true,
    model,
    nextRecommendation: recommendationCopy(result, protocolAdjustment),
  };
}
