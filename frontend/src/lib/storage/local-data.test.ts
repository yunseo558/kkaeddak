import "fake-indexeddb/auto";

import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_DATABASE_NAME,
  LocalDataStore,
  type HealthInputRecord,
  type LocalWakeReportRecord,
  type WakeEventRecord,
  type WakeModelRecord,
} from "./local-data";

const healthInput: HealthInputRecord = {
  id: "scenario",
  source: "sample",
  scenarioId: "exam-morning",
  sleepDurationMinutes: 330,
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const wakeModel: WakeModelRecord = {
  id: "personal",
  baseline: { sleepDurationMinutes: 420 },
  parameters: { recentFailureWeight: 0.3 },
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const wakeEvent: WakeEventRecord = {
  id: "event-1",
  eventType: "ALARM_DISMISSED",
  occurredAt: "2026-09-18T00:00:00.000Z",
};

const wakeReport: LocalWakeReportRecord = {
  id: "2026-09-19",
  localDate: "2026-09-19",
  updatedAt: "2026-09-18T00:00:00.000Z",
  decisionContext: null,
  learningEffect: null,
  outcome: null,
  alarmTimeline: [],
  plan: {
    id: "00000000-0000-4000-8000-000000000001",
    localDate: "2026-09-19",
    timezone: "Asia/Seoul",
    deadlineAt: "2026-09-18T23:00:00.000Z",
    firstAlarmAt: "2026-09-18T22:50:00.000Z",
    finalAlarmAt: "2026-09-18T23:00:00.000Z",
    importance: "NORMAL",
    protocolLevel: 1,
    steps: [{ order: 1, offsetMin: 0, channel: "PHONE_SOUND" }],
    reasonCodes: [],
    requiresApproval: false,
    modelVersion: "test",
    revision: 1,
    status: "COMPLETED",
  },
};

afterEach(async () => {
  await deleteDB(LOCAL_DATABASE_NAME);
});

describe("LocalDataStore", () => {
  it("persists records in every privacy-scoped store", async () => {
    const store = new LocalDataStore();

    await store.put("health-inputs", healthInput);
    await store.put("wake-model", wakeModel);
    await store.put("wake-events", wakeEvent);
    await store.put("wake-reports", wakeReport);

    expect(await store.getAll("health-inputs")).toEqual([healthInput]);
    expect(await store.getAll("wake-model")).toEqual([wakeModel]);
    expect(await store.getAll("wake-events")).toEqual([wakeEvent]);
    expect(await store.getAll("wake-reports")).toEqual([wakeReport]);
    expect(store.getMode()).toBe("persistent");

    store.close();
  });

  it("clears every local store in one operation", async () => {
    const store = new LocalDataStore();
    await store.put("health-inputs", healthInput);
    await store.put("wake-model", wakeModel);
    await store.put("wake-events", wakeEvent);
    await store.put("wake-reports", wakeReport);

    await store.clearAll();

    expect(await store.getAll("health-inputs")).toEqual([]);
    expect(await store.getAll("wake-model")).toEqual([]);
    expect(await store.getAll("wake-events")).toEqual([]);
    expect(await store.getAll("wake-reports")).toEqual([]);

    store.close();
  });

  it("switches to an in-memory one-time mode when storage is blocked", async () => {
    const store = new LocalDataStore(async () => {
      throw new Error("storage blocked");
    });

    await store.put("health-inputs", healthInput);

    expect(store.getMode()).toBe("ephemeral");
    expect(await store.getAll("health-inputs")).toEqual([healthInput]);
  });
});
