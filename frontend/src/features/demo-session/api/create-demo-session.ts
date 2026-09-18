import type { components } from "@kkaeddak/api-client";

import { apiClient } from "@/lib/api/client";
import { pickAllowedApiPayload } from "@/lib/privacy/api-payload";

import type { ScenarioId } from "../model/scenarios";

type DemoSessionResponse = components["schemas"]["DemoSessionResponse"];
type DemoSessionCreate = components["schemas"]["DemoSessionCreate"];

export class DemoSessionRequestError extends Error {
  constructor(readonly status: number) {
    super(`Demo session request failed with status ${status}`);
    this.name = "DemoSessionRequestError";
  }
}

export function createDemoSessionPayload(
  scenarioId: ScenarioId,
): DemoSessionCreate {
  const source = {
    locale: "ko-KR",
    scenarioId,
    timezone: "Asia/Seoul",
  };

  return pickAllowedApiPayload(source, [
    "locale",
    "scenarioId",
    "timezone",
  ]);
}

export async function createDemoSession(
  scenarioId: ScenarioId,
): Promise<DemoSessionResponse> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/demo-sessions",
    {
      body: createDemoSessionPayload(scenarioId),
    },
  );

  if (!data || error) {
    throw new DemoSessionRequestError(response.status);
  }

  return data;
}
