"use client";

import { useQuery } from "@tanstack/react-query";

import { getPreparationSuggestions } from "@/features/tomorrow/api/tomorrow-api";
import { createLocalPreparationSuggestions } from "@/features/tomorrow/model/local-fixtures";
import type { TomorrowOverview } from "@/features/tomorrow/model/tomorrow-data";

export const preparationQueryKey = (
  mode: string | null,
  sessionId: string | null,
  eventId: string | null,
) => ["preparation-suggestions", mode, sessionId, eventId] as const;

export function usePreparationSuggestions(input: {
  mode: "local" | "server" | null;
  overview?: TomorrowOverview;
  sessionId: string | null;
}) {
  const eventId = input.overview?.event?.id ?? null;
  return useQuery({
    queryKey: preparationQueryKey(input.mode, input.sessionId, eventId),
    enabled: Boolean(input.overview?.event),
    queryFn: () => {
      if (!input.overview?.event) {
        throw new Error("A schedule event is required");
      }
      if (input.mode === "local") {
        return Promise.resolve(
          createLocalPreparationSuggestions(input.overview),
        );
      }
      if (!input.sessionId) {
        throw new Error("A demo session is required");
      }
      return getPreparationSuggestions(
        input.sessionId,
        input.overview.event.id,
        input.overview.routine.routineTasks,
      );
    },
  });
}
