import {
  localDataStore,
  type HealthInputRecord,
} from "@/lib/storage/local-data";

import type { ScenarioId } from "./scenarios";

const scenarioHealthInputs: Record<
  ScenarioId,
  Omit<HealthInputRecord, "id" | "source" | "updatedAt">
> = {
  "regular-class": {
    scenarioId: "regular-class",
    sleepDurationMinutes: 430,
    activityLevel: "usual",
    conditionLevel: "usual",
    recentFirstAlarmSucceeded: true,
  },
  "exam-morning": {
    scenarioId: "exam-morning",
    sleepDurationMinutes: 330,
    activityLevel: "usual",
    conditionLevel: "usual",
    recentFirstAlarmSucceeded: false,
  },
  "tired-interview": {
    scenarioId: "tired-interview",
    sleepDurationMinutes: 360,
    activityLevel: "high",
    conditionLevel: "low",
    recentFirstAlarmSucceeded: false,
  },
};

export function createScenarioHealthInput(
  scenarioId: ScenarioId,
  updatedAt = new Date().toISOString(),
): HealthInputRecord {
  return {
    id: "active-demo-scenario",
    source: "sample",
    ...scenarioHealthInputs[scenarioId],
    updatedAt,
  };
}

export async function saveScenarioHealthInput(
  scenarioId: ScenarioId,
): Promise<void> {
  await localDataStore.put(
    "health-inputs",
    createScenarioHealthInput(scenarioId),
  );
}
