import { describe, expect, it } from "vitest";

import {
  createPreparationSuggestionPayload,
  createPreparationTaskPayload,
  createScheduleWindow,
} from "./tomorrow-api";

describe("tomorrow API payloads", () => {
  it("builds a 48-hour normalized schedule window", () => {
    expect(createScheduleWindow(new Date("2026-09-18T00:00:00.000Z"))).toEqual({
      from: "2026-09-18T00:00:00.000Z",
      to: "2026-09-20T00:00:00.000Z",
    });
  });

  it("allowlists routine candidates for preparation suggestions", () => {
    expect(
      createPreparationSuggestionPayload(
        "00000000-0000-4000-8000-000000000010",
        [
          {
            code: "PACK_BAG",
            label: "가방 준비",
            minutes: 10,
            movableToNight: true,
          },
        ],
      ),
    ).toEqual({
      eventId: "00000000-0000-4000-8000-000000000010",
      availableRoutineTasks: [
        { code: "PACK_BAG", minutes: 10, movableToNight: true },
      ],
      maxSuggestions: 3,
    });
  });

  it("uses only status and revision for preparation updates", () => {
    expect(createPreparationTaskPayload("COMPLETED", 2)).toEqual({
      status: "COMPLETED",
      revision: 2,
    });
  });
});
