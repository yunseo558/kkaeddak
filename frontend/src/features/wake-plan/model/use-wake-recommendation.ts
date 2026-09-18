"use client";

import { useQuery } from "@tanstack/react-query";

import { usePreparationSuggestions } from "@/features/preparation/model/use-preparation-suggestions";
import {
  calculateWakeDeadline,
  sumCompletedPreparationMinutes,
  sumRoutineMinutes,
} from "@/features/tomorrow/lib/schedule-calculation";
import { useTomorrowOverview } from "@/features/tomorrow/model/use-tomorrow-overview";
import { localDataStore } from "@/lib/storage/local-data";

import { calculateWakeRecommendation } from "../lib/recommendation-engine";

export function useWakeRecommendation() {
  const overviewState = useTomorrowOverview();
  const overview = overviewState.query.data;
  const preparationQuery = usePreparationSuggestions({
    mode: overviewState.mode,
    overview,
    sessionId: overviewState.sessionId,
  });
  const preparationFingerprint = preparationQuery.data?.suggestions
    .map((suggestion) => `${suggestion.id}:${suggestion.status}:${suggestion.revision}`)
    .join("|");

  const recommendationQuery = useQuery({
    queryKey: [
      "wake-recommendation",
      overviewState.scenarioId,
      overview?.event?.id,
      preparationFingerprint,
    ],
    enabled: Boolean(overview?.event && preparationQuery.data),
    queryFn: async () => {
      if (!overview?.event || !preparationQuery.data) {
        throw new Error("Schedule and preparation data are required");
      }

      const [healthInputs, wakeModels] = await Promise.all([
        localDataStore.getAll("health-inputs"),
        localDataStore.getAll("wake-model"),
      ]);
      const healthInput =
        healthInputs.find(
          (input) => input.scenarioId === overviewState.scenarioId,
        ) ?? null;
      const personalBaseline = wakeModels.find(
        (model) => model.id === "personal",
      )?.baseline.sleepDurationMinutes;
      const completedPreparationMinutes = sumCompletedPreparationMinutes(
        preparationQuery.data.suggestions,
      );
      const routineMinutes = sumRoutineMinutes(overview.routine.routineTasks);
      const deadlineAt = calculateWakeDeadline({
        eventStartsAt: overview.event.startsAt,
        routineMinutes,
        wakeBufferMinutes: overview.routine.wakeBufferMin,
        completedPreparationMinutes,
      });

      return calculateWakeRecommendation({
        completedPreparationMinutes,
        deadlineAt,
        healthInput,
        importance: overview.event.importance,
        maxProtocolLevel: overview.routine.alarmPreferences.maxProtocolLevel,
        personalSleepBaselineMinutes: personalBaseline,
        preferredFirstChannel:
          overview.routine.alarmPreferences.preferredFirstChannel,
      });
    },
  });

  return {
    ...overviewState,
    overview,
    preparationQuery,
    recommendationQuery,
  };
}
