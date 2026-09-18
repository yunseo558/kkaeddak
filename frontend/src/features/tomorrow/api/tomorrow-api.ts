import {
  demoSessionHeaders,
  type components,
} from "@kkaeddak/api-client";

import { apiClient } from "@/lib/api/client";
import { pickAllowedApiPayload } from "@/lib/privacy/api-payload";

import type {
  PreparationSuggestions,
  TomorrowOverview,
} from "../model/tomorrow-data";

type RoutineTask = components["schemas"]["RoutineTask"];
type PreparationSuggestionCreate =
  components["schemas"]["PreparationSuggestionCreate"];
type PreparationTaskUpdate =
  components["schemas"]["PreparationTaskUpdate"];
type PreparationTaskResponse =
  components["schemas"]["PreparationTaskResponse"];

export class TomorrowRequestError extends Error {
  constructor(
    readonly resource: "preparation" | "routine" | "schedule",
    readonly status: number,
  ) {
    super(`${resource} request failed with status ${status}`);
    this.name = "TomorrowRequestError";
  }
}

export function createScheduleWindow(reference = new Date()) {
  return {
    from: reference.toISOString(),
    to: new Date(reference.getTime() + 48 * 60 * 60 * 1_000).toISOString(),
  };
}

export function createPreparationSuggestionPayload(
  eventId: string,
  routineTasks: readonly RoutineTask[],
): PreparationSuggestionCreate {
  const source = {
    eventId,
    availableRoutineTasks: routineTasks.map((task) =>
      pickAllowedApiPayload(task, ["code", "minutes", "movableToNight"]),
    ),
    maxSuggestions: 3,
  };

  return pickAllowedApiPayload(source, [
    "eventId",
    "availableRoutineTasks",
    "maxSuggestions",
  ]);
}

export function createPreparationTaskPayload(
  status: PreparationTaskUpdate["status"],
  revision: number,
): PreparationTaskUpdate {
  return pickAllowedApiPayload({ status, revision }, ["status", "revision"]);
}

export async function getTomorrowOverview(
  sessionId: string,
  reference = new Date(),
): Promise<TomorrowOverview> {
  const headers = demoSessionHeaders(sessionId);
  const window = createScheduleWindow(reference);
  const [routineResult, scheduleResult] = await Promise.all([
    apiClient.GET("/api/v1/routines", { headers }),
    apiClient.GET("/api/v1/schedule-events", {
      headers,
      params: { query: { ...window, limit: 30 } },
    }),
  ]);

  if (!routineResult.data || routineResult.error) {
    throw new TomorrowRequestError("routine", routineResult.response.status);
  }
  if (!scheduleResult.data || scheduleResult.error) {
    throw new TomorrowRequestError("schedule", scheduleResult.response.status);
  }

  const event = [...scheduleResult.data.items].sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  )[0];

  return { event: event ?? null, routine: routineResult.data };
}

export async function getPreparationSuggestions(
  sessionId: string,
  eventId: string,
  routineTasks: readonly RoutineTask[],
): Promise<PreparationSuggestions> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/preparation-suggestions",
    {
      headers: demoSessionHeaders(sessionId),
      body: createPreparationSuggestionPayload(eventId, routineTasks),
    },
  );

  if (!data || error) {
    throw new TomorrowRequestError("preparation", response.status);
  }
  return data;
}

export async function updatePreparationTask(
  sessionId: string,
  taskId: string,
  status: PreparationTaskUpdate["status"],
  revision: number,
): Promise<PreparationTaskResponse> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/preparation-tasks/{task_id}",
    {
      headers: demoSessionHeaders(sessionId),
      params: { path: { task_id: taskId } },
      body: createPreparationTaskPayload(status, revision),
    },
  );

  if (!data || error) {
    throw new TomorrowRequestError("preparation", response.status);
  }
  return data;
}
