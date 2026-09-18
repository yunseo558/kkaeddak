import { describe, expect, it } from "vitest";

import {
  createLocalPreparationSuggestions,
  createLocalTomorrowOverview,
} from "./local-fixtures";

describe("local tomorrow fixtures", () => {
  it("matches the server-seeded exam schedule and routine contract", () => {
    const overview = createLocalTomorrowOverview(
      "exam-morning",
      new Date("2026-09-18T00:00:00.000Z"),
    );

    expect(overview.event).toMatchObject({
      displayTitle: "오전 시험",
      importance: "IMPORTANT",
      startsAt: "2026-09-19T00:00:00.000Z",
    });
    expect(overview.routine.wakeBufferMin).toBe(15);
    expect(overview.routine.routineTasks).toHaveLength(3);
  });

  it("suggests only routine tasks that can move to the previous night", () => {
    const overview = createLocalTomorrowOverview(
      "regular-class",
      new Date("2026-09-18T00:00:00.000Z"),
    );

    const result = createLocalPreparationSuggestions(overview);

    expect(result.suggestions.map((suggestion) => suggestion.code)).toEqual([
      "SHOWER",
      "PACK_BAG",
    ]);
    expect(result.totalPotentialMinutes).toBe(30);
  });
});
