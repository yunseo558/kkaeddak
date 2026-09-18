import { describe, expect, it } from "vitest";

import { createScenarioHealthInput } from "./scenario-health-input";

describe("createScenarioHealthInput", () => {
  it("keeps health scenario values in a local-only record", () => {
    expect(
      createScenarioHealthInput(
        "tired-interview",
        "2026-09-18T00:00:00.000Z",
      ),
    ).toEqual({
      id: "active-demo-scenario",
      source: "sample",
      scenarioId: "tired-interview",
      sleepDurationMinutes: 360,
      activityLevel: "high",
      conditionLevel: "low",
      recentFirstAlarmSucceeded: false,
      updatedAt: "2026-09-18T00:00:00.000Z",
    });
  });
});
