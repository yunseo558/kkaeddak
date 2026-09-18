import { describe, expect, it } from "vitest";

import {
  assertSafeApiPayload,
  findForbiddenApiFields,
  pickAllowedApiPayload,
} from "./api-payload";

describe("API privacy boundary", () => {
  it("finds forbidden fields recursively in objects and arrays", () => {
    const fields = findForbiddenApiFields({
      profile: {
        candidates: [{ displayName: "sample" }, { heart_rate: [72, 75] }],
      },
      sleepDurationMinutes: 330,
    });

    expect(fields).toEqual([
      "$.profile.candidates[1].heart_rate",
      "$.sleepDurationMinutes",
    ]);
  });

  it("creates a new payload from explicit allowed keys", () => {
    const source = {
      locale: "ko-KR",
      rawHealthData: { value: "local only" },
      scenarioId: "exam-morning",
      timezone: "Asia/Seoul",
    };

    expect(
      pickAllowedApiPayload(source, ["locale", "scenarioId", "timezone"]),
    ).toEqual({
      locale: "ko-KR",
      scenarioId: "exam-morning",
      timezone: "Asia/Seoul",
    });
  });

  it("rejects forbidden fields before a request can be made", () => {
    expect(() =>
      assertSafeApiPayload({ profile: { personalModelParameters: {} } }),
    ).toThrow("$.profile.personalModelParameters");
  });
});
