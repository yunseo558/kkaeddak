import { describe, expect, it } from "vitest";

import { getScenario, scenarioIdSchema, scenarios } from "./scenarios";

describe("demo scenarios", () => {
  it("keeps the three backend seed identifiers", () => {
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "regular-class",
      "exam-morning",
      "tired-interview",
    ]);
  });

  it("uses the exam scenario as a valid default", () => {
    expect(scenarioIdSchema.parse("exam-morning")).toBe("exam-morning");
    expect(getScenario("exam-morning")?.name).toBe("오전 시험");
  });
});
