import { describe, expect, it } from "vitest";

import { createMockCalendar } from "@/features/service/lib/mock-integrations";
import { addDays, localDate } from "@/features/service/model/service-policy";
import { upsertScheduleEvents } from "./handlers";

describe("mock calendar persistence", () => {
  it("keeps the imported calendar when one event is edited", () => {
    const imported = createMockCalendar("2026-09-20").map((event) => ({
      ...event,
      id: event.clientId,
    }));
    const original = imported[0];
    const updated = {
      ...original,
      displayTitle: "수정한 첫 일정",
    };

    const result = upsertScheduleEvents(imported, [updated]);

    expect(result).toHaveLength(imported.length);
    expect(
      result.find((event) => event.clientId === original.clientId)?.displayTitle,
    ).toBe("수정한 첫 일정");
    expect(result.some((event) => event.clientId === "mock-calendar-2026-10-30"))
      .toBe(true);
  });

  it("provides at least one event every day through October 30", () => {
    const imported = createMockCalendar("2026-09-20");
    const dates = new Set(imported.map((event) => localDate(event.startsAt)));
    let date = "2026-09-21";

    while (date <= "2026-10-30") {
      expect(dates.has(date), `${date} should have an event`).toBe(true);
      date = addDays(date, 1);
    }
  });
});
