import {
  demoSessionHeaders,
  type components,
} from "@kkaeddak/api-client";

import { apiClient } from "@/lib/api/client";
import { pickAllowedApiPayload } from "@/lib/privacy/api-payload";

type ProfileResponse = components["schemas"]["ProfileResponse"];
type ProfileUpdate = components["schemas"]["ProfileUpdate"];

export class PrivacyRequestError extends Error {
  constructor(readonly status: number) {
    super(`privacy request failed with status ${status}`);
    this.name = "PrivacyRequestError";
  }
}

export function createOutcomeSyncProfilePayload(
  profile: ProfileResponse,
  allowAggregateOutcomeSync: boolean,
): ProfileUpdate {
  return pickAllowedApiPayload(
    {
      allowAggregateOutcomeSync,
      allowImportantEventDetection: profile.allowImportantEventDetection,
      automationMode: profile.automationMode,
      locale: profile.locale,
      revision: profile.revision,
      timezone: profile.timezone,
    },
    [
      "allowAggregateOutcomeSync",
      "allowImportantEventDetection",
      "automationMode",
      "locale",
      "revision",
      "timezone",
    ],
  );
}

export async function getPrivacyProfile(sessionId: string) {
  const { data, error, response } = await apiClient.GET("/api/v1/profile", {
    headers: demoSessionHeaders(sessionId),
  });
  if (!data || error) {
    throw new PrivacyRequestError(response.status);
  }
  return data;
}

export async function updateOutcomeSyncConsent(
  sessionId: string,
  allowAggregateOutcomeSync: boolean,
) {
  const profile = await getPrivacyProfile(sessionId);
  const { data, error, response } = await apiClient.PUT("/api/v1/profile", {
    headers: demoSessionHeaders(sessionId),
    body: createOutcomeSyncProfilePayload(
      profile,
      allowAggregateOutcomeSync,
    ),
  });
  if (!data || error) {
    throw new PrivacyRequestError(response.status);
  }
  return data;
}
