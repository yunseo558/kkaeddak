import type { components } from "@kkaeddak/api-client";

import type { ScenarioId } from "@/features/demo-session/model/scenarios";

import type {
  PreparationSuggestions,
  TomorrowOverview,
} from "./tomorrow-data";

type Importance = components["schemas"]["Importance"];

const KOREA_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;

const scenarioEvents: Record<
  ScenarioId,
  {
    category: string;
    displayTitle: string;
    durationMinutes: number;
    hour: number;
    importance: Importance;
    minute: number;
  }
> = {
  "regular-class": {
    category: "CLASS",
    displayTitle: "오전 수업",
    durationMinutes: 90,
    hour: 10,
    importance: "NORMAL",
    minute: 0,
  },
  "exam-morning": {
    category: "EXAM",
    displayTitle: "오전 시험",
    durationMinutes: 90,
    hour: 9,
    importance: "IMPORTANT",
    minute: 0,
  },
  "tired-interview": {
    category: "INTERVIEW",
    displayTitle: "오전 면접",
    durationMinutes: 60,
    hour: 8,
    importance: "IMPORTANT",
    minute: 30,
  },
};

function nextKoreanOccurrence(
  reference: Date,
  hour: number,
  minute: number,
): Date {
  const koreanReference = new Date(
    reference.getTime() + KOREA_OFFSET_MILLISECONDS,
  );
  let timestamp =
    Date.UTC(
      koreanReference.getUTCFullYear(),
      koreanReference.getUTCMonth(),
      koreanReference.getUTCDate(),
      hour,
      minute,
    ) - KOREA_OFFSET_MILLISECONDS;

  if (timestamp <= reference.getTime()) {
    timestamp += 24 * 60 * 60 * 1_000;
  }

  return new Date(timestamp);
}

export function createLocalTomorrowOverview(
  scenarioId: ScenarioId,
  reference = new Date(),
): TomorrowOverview {
  const scenario = scenarioEvents[scenarioId];
  const startsAt = nextKoreanOccurrence(
    reference,
    scenario.hour,
    scenario.minute,
  );
  const endsAt = new Date(
    startsAt.getTime() + scenario.durationMinutes * 60_000,
  );

  return {
    event: {
      id: "00000000-0000-4000-8000-000000000010",
      clientId: `local-${scenarioId}`,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      category: scenario.category,
      importance: scenario.importance,
      locationMode: "ONSITE",
      displayTitle: scenario.displayTitle,
    },
    routine: {
      wakeBufferMin: 15,
      routineTasks: [
        { code: "SHOWER", label: "샤워", minutes: 20, movableToNight: true },
        {
          code: "BREAKFAST",
          label: "아침 식사",
          minutes: 15,
          movableToNight: false,
        },
        {
          code: "PACK_BAG",
          label: "가방 준비",
          minutes: 10,
          movableToNight: true,
        },
      ],
      alarmPreferences: {
        preferredFirstChannel: "WATCH_HAPTIC",
        maxProtocolLevel: 4,
      },
      revision: 1,
      updatedAt: reference.toISOString(),
    },
  };
}

export function createLocalPreparationSuggestions(
  overview: TomorrowOverview,
): PreparationSuggestions {
  const labels: Record<string, string> = {
    PACK_BAG: "가방 미리 준비하기",
    SHOWER: "샤워 미리 하기",
  };
  const suggestions = overview.routine.routineTasks
    .filter((task) => task.movableToNight)
    .slice(0, 3)
    .map((task, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
      code: task.code,
      label: labels[task.code] ?? `${task.label} 미리 하기`,
      minutesSaved: task.minutes,
      source: "TEMPLATE",
      status: "SUGGESTED" as const,
      revision: 1,
    }));

  return {
    suggestions,
    totalPotentialMinutes: suggestions.reduce(
      (total, suggestion) => total + suggestion.minutesSaved,
      0,
    ),
  };
}
