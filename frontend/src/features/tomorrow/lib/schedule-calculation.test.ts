import type { components } from "@kkaeddak/api-client";
import { describe, expect, it } from "vitest";

import {
  calculateWakeDeadline,
  getScheduleDemand,
  sumCompletedPreparationMinutes,
  sumRoutineMinutes,
} from "./schedule-calculation";

type PreparationSuggestion = components["schemas"]["PreparationSuggestion"];

describe("tomorrow schedule calculations", () => {
  it("reverses an event time by the routine and wake buffer", () => {
    expect(
      calculateWakeDeadline({
        eventStartsAt: "2026-09-19T00:00:00.000Z",
        routineMinutes: 45,
        wakeBufferMinutes: 15,
      }),
    ).toBe("2026-09-18T23:00:00.000Z");
  });

  it("moves the deadline later only by completed preparation time", () => {
    expect(
      calculateWakeDeadline({
        eventStartsAt: "2026-09-19T00:00:00.000Z",
        routineMinutes: 45,
        wakeBufferMinutes: 15,
        completedPreparationMinutes: 25,
      }),
    ).toBe("2026-09-18T23:25:00.000Z");
  });

  it("sums routine and completed preparation minutes", () => {
    expect(
      sumRoutineMinutes([
        { code: "SHOWER", label: "샤워", minutes: 20, movableToNight: true },
        {
          code: "BREAKFAST",
          label: "아침 식사",
          minutes: 15,
          movableToNight: false,
        },
      ]),
    ).toBe(35);

    const suggestions: PreparationSuggestion[] = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        code: "SHOWER",
        label: "샤워 미리 하기",
        minutesSaved: 20,
        source: "TEMPLATE",
        status: "COMPLETED",
        revision: 2,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        code: "PACK_BAG",
        label: "가방 미리 준비하기",
        minutesSaved: 10,
        source: "TEMPLATE",
        status: "ACCEPTED",
        revision: 2,
      },
    ];
    expect(sumCompletedPreparationMinutes(suggestions)).toBe(20);
  });

  it("classifies schedule demand without health or model inputs", () => {
    expect(getScheduleDemand("NORMAL", 30)).toBe("낮음");
    expect(getScheduleDemand("IMPORTANT", 30)).toBe("보통");
    expect(getScheduleDemand("NORMAL", 80)).toBe("높음");
  });
});
