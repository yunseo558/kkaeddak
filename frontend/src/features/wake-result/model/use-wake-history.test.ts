import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { localDataStore } from "@/lib/storage/local-data";

import { createHistoryWindow, getLocalWakeHistory } from "./use-wake-history";

beforeEach(async () => {
  localDataStore.close();
  await localDataStore.clearAll();
});

describe("local wake history", () => {
  it("creates an inclusive Korean 30-day window", () => {
    expect(
      createHistoryWindow(new Date("2026-09-18T15:30:00.000Z")),
    ).toEqual({ from: "2026-08-21", to: "2026-09-19" });
  });

  it("aggregates only outcome records inside the window", async () => {
    await localDataStore.put("wake-events", {
      id: "transition",
      eventType: "DISMISS_ALARM",
      occurredAt: "2026-09-18T22:50:00.000Z",
    });
    await localDataStore.put("wake-events", {
      id: "outcome-1",
      alarmStepsUsed: 2,
      eventType: "OUTCOME_RECORDED",
      localDate: "2026-09-19",
      occurredAt: "2026-09-18T23:00:00.000Z",
      outcome: "CONFIRMED_ON_TIME",
    });
    await localDataStore.put("wake-events", {
      id: "outcome-2",
      alarmStepsUsed: 3,
      eventType: "OUTCOME_RECORDED",
      localDate: "2026-09-20",
      occurredAt: "2026-09-19T23:00:00.000Z",
      outcome: "CONFIRMED_LATE",
    });

    await expect(getLocalWakeHistory("2026-09-19", "2026-09-19")).resolves.toEqual({
      fromDate: "2026-09-19",
      toDate: "2026-09-19",
      totalSessions: 1,
      onTimeSessions: 1,
      lateSessions: 0,
      unconfirmedSessions: 0,
      averageAlarmSteps: 2,
    });
  });
});
