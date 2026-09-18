import "fake-indexeddb/auto";

import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import {
  LOCAL_DATABASE_NAME,
  LocalDataStore,
  type HealthInputRecord,
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

afterEach(async () => {
  await deleteDB(LOCAL_DATABASE_NAME);
});

describe("LocalDataStore", () => {
  it("persists records in the three privacy-scoped stores", async () => {
    const store = new LocalDataStore();

    await store.put("health-inputs", healthInput);
    await store.put("wake-model", wakeModel);
    await store.put("wake-events", wakeEvent);

    expect(await store.getAll("health-inputs")).toEqual([healthInput]);
    expect(await store.getAll("wake-model")).toEqual([wakeModel]);
    expect(await store.getAll("wake-events")).toEqual([wakeEvent]);
    expect(store.getMode()).toBe("persistent");

    store.close();
  });

  it("clears every local store in one operation", async () => {
    const store = new LocalDataStore();
    await store.put("health-inputs", healthInput);
    await store.put("wake-model", wakeModel);
    await store.put("wake-events", wakeEvent);

    await store.clearAll();

    expect(await store.getAll("health-inputs")).toEqual([]);
    expect(await store.getAll("wake-model")).toEqual([]);
    expect(await store.getAll("wake-events")).toEqual([]);

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
