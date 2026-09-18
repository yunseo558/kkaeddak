import type { components } from "@kkaeddak/api-client";

export type RoutineProfile = components["schemas"]["RoutineProfileResponse"];
export type ScheduleEvent = components["schemas"]["ScheduleEventResponse"];
export type PreparationSuggestions =
  components["schemas"]["PreparationSuggestionsResponse"];

export type TomorrowOverview = {
  event: ScheduleEvent | null;
  routine: RoutineProfile;
};
