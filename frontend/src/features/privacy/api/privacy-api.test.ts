import type { components } from "@kkaeddak/api-client";
import { describe, expect, it } from "vitest";

import { createOutcomeSyncProfilePayload } from "./privacy-api";

const profile: components["schemas"]["ProfileResponse"] = {
  allowAggregateOutcomeSync: false,
  allowImportantEventDetection: true,
  automationMode: "RECOMMEND_ONLY",
  locale: "ko-KR",
  revision: 1,
  timezone: "Asia/Seoul",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

describe("privacy profile API payload", () => {
  it("changes only explicit aggregate consent while preserving the contract", () => {
    expect(
      createOutcomeSyncProfilePayload(
        { ...profile, rawHealthData: { sleep: 300 } } as typeof profile,
        true,
      ),
    ).toEqual({
      allowAggregateOutcomeSync: true,
      allowImportantEventDetection: true,
      automationMode: "RECOMMEND_ONLY",
      locale: "ko-KR",
      revision: 1,
      timezone: "Asia/Seoul",
    });
  });
});
