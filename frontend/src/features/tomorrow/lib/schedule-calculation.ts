import type { components } from "@kkaeddak/api-client";

type Importance = components["schemas"]["Importance"];
type RoutineTask = components["schemas"]["RoutineTask"];
type PreparationSuggestion = components["schemas"]["PreparationSuggestion"];

export function sumRoutineMinutes(tasks: readonly RoutineTask[]): number {
  return tasks.reduce((total, task) => total + task.minutes, 0);
}

export function sumCompletedPreparationMinutes(
  suggestions: readonly PreparationSuggestion[],
): number {
  return suggestions
    .filter((suggestion) => suggestion.status === "COMPLETED")
    .reduce((total, suggestion) => total + suggestion.minutesSaved, 0);
}

export function calculateWakeDeadline(input: {
  eventStartsAt: string;
  routineMinutes: number;
  wakeBufferMinutes: number;
  completedPreparationMinutes?: number;
}): string {
  const eventStartsAt = new Date(input.eventStartsAt);
  if (Number.isNaN(eventStartsAt.getTime())) {
    throw new Error("eventStartsAt must be a valid ISO date-time");
  }

  const routineMinutes = Math.max(0, input.routineMinutes);
  const completedPreparationMinutes = Math.min(
    routineMinutes,
    Math.max(0, input.completedPreparationMinutes ?? 0),
  );
  const minutesBeforeEvent =
    Math.max(0, input.wakeBufferMinutes) +
    routineMinutes -
    completedPreparationMinutes;

  return new Date(
    eventStartsAt.getTime() - minutesBeforeEvent * 60_000,
  ).toISOString();
}

export function getScheduleDemand(
  importance: Importance,
  minutesBeforeEvent: number,
): "낮음" | "보통" | "높음" {
  if (importance === "CRITICAL" || minutesBeforeEvent >= 75) {
    return "높음";
  }
  if (importance === "IMPORTANT" || minutesBeforeEvent >= 45) {
    return "보통";
  }
  return "낮음";
}

export function formatKoreanDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatKoreanTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
