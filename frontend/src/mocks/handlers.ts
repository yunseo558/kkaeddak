import type { components } from "@kkaeddak/api-client";
import { http, HttpResponse } from "msw";

import type { ScenarioId } from "@/features/demo-session/model/scenarios";
import {
  createLocalPreparationSuggestions,
  createLocalTomorrowOverview,
} from "@/features/tomorrow/model/local-fixtures";

type DemoSessionCreate = components["schemas"]["DemoSessionCreate"];
type DemoSessionResponse = components["schemas"]["DemoSessionResponse"];
type PreparationSuggestionCreate =
  components["schemas"]["PreparationSuggestionCreate"];
type PreparationSuggestionsResponse =
  components["schemas"]["PreparationSuggestionsResponse"];
type PreparationTaskUpdate =
  components["schemas"]["PreparationTaskUpdate"];
type PreparationTaskResponse =
  components["schemas"]["PreparationTaskResponse"];
type RoutineProfileResponse = components["schemas"]["RoutineProfileResponse"];
type ScheduleEventsResponse = components["schemas"]["ScheduleEventsResponse"];

const sessions = new Map<string, ScenarioId>();
const preparationTasks = new Map<
  string,
  PreparationSuggestionsResponse["suggestions"][number]
>();

function getScenarioFromRequest(request: Request): ScenarioId {
  const sessionId = request.headers.get("X-Demo-Session");
  return (sessionId && sessions.get(sessionId)) || "exam-morning";
}

export const handlers = [
  http.post<never, DemoSessionCreate, DemoSessionResponse>(
    "/api/v1/demo-sessions",
    async ({ request }) => {
      const body = await request.json();
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, body.scenarioId as ScenarioId);

      return HttpResponse.json(
        {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          seeded: true,
          sessionId,
        },
        { status: 201 },
      );
    },
  ),
  http.get<never, never, RoutineProfileResponse>(
    "/api/v1/routines",
    ({ request }) => {
      const overview = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      );
      return HttpResponse.json(overview.routine);
    },
  ),
  http.get<never, never, ScheduleEventsResponse>(
    "/api/v1/schedule-events",
    ({ request }) => {
      const overview = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      );
      return HttpResponse.json({
        items: overview.event ? [overview.event] : [],
        nextCursor: null,
      });
    },
  ),
  http.post<never, PreparationSuggestionCreate, PreparationSuggestionsResponse>(
    "/api/v1/preparation-suggestions",
    async ({ request }) => {
      await request.json();
      const overview = createLocalTomorrowOverview(
        getScenarioFromRequest(request),
      );
      const local = createLocalPreparationSuggestions(overview);
      const suggestions = local.suggestions.map((suggestion) => {
        const stored = preparationTasks.get(suggestion.id) ?? suggestion;
        preparationTasks.set(stored.id, stored);
        return stored;
      });
      return HttpResponse.json({
        suggestions,
        totalPotentialMinutes: local.totalPotentialMinutes,
      });
    },
  ),
  http.patch<
    { task_id: string },
    PreparationTaskUpdate,
    PreparationTaskResponse
  >(
    "/api/v1/preparation-tasks/:task_id",
    async ({ params, request }) => {
      const body = await request.json();
      const current = preparationTasks.get(params.task_id);
      const updated = {
        id: params.task_id,
        status: body.status,
        revision: (current?.revision ?? body.revision) + 1,
        updatedAt: new Date().toISOString(),
      };
      if (current) {
        preparationTasks.set(params.task_id, {
          ...current,
          status: updated.status,
          revision: updated.revision,
        });
      }
      return HttpResponse.json(updated);
    },
  ),
];
