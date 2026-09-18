import type { components } from "@kkaeddak/api-client";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

type WakeOutcome = components["schemas"]["WakeOutcome"];

export const LOCAL_DATABASE_NAME = "kkaeddak-local";
export const LOCAL_DATABASE_VERSION = 1;

export const LOCAL_STORE_NAMES = [
  "health-inputs",
  "wake-model",
  "wake-events",
] as const;

export type LocalStoreName = (typeof LOCAL_STORE_NAMES)[number];
export type LocalStorageMode = "persistent" | "ephemeral";

export type HealthInputRecord = {
  id: string;
  source: "manual" | "sample";
  scenarioId?: string;
  sleepDurationMinutes?: number;
  activityLevel?: "low" | "usual" | "high";
  conditionLevel?: "low" | "usual" | "high";
  recentFirstAlarmSucceeded?: boolean;
  updatedAt: string;
};

export type WakeModelRecord = {
  id: string;
  baseline: Record<string, number>;
  parameters: Record<string, number>;
  updatedAt: string;
};

export type WakeEventRecord = {
  id: string;
  eventType: string;
  occurredAt: string;
  alarmStepsUsed?: number;
  confirmedAt?: string | null;
  localDate?: string;
  outcome?: WakeOutcome;
  planId?: string;
  userCorrection?: boolean;
};

interface KkaeddakLocalDatabase extends DBSchema {
  "health-inputs": {
    key: string;
    value: HealthInputRecord;
  };
  "wake-model": {
    key: string;
    value: WakeModelRecord;
  };
  "wake-events": {
    key: string;
    value: WakeEventRecord;
  };
}

type LocalRecordMap = {
  "health-inputs": HealthInputRecord;
  "wake-events": WakeEventRecord;
  "wake-model": WakeModelRecord;
};

type OpenDatabase = () => Promise<IDBPDatabase<KkaeddakLocalDatabase>>;

function openLocalDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }

  return openDB<KkaeddakLocalDatabase>(
    LOCAL_DATABASE_NAME,
    LOCAL_DATABASE_VERSION,
    {
      upgrade(database) {
        for (const storeName of LOCAL_STORE_NAMES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: "id" });
          }
        }
      },
    },
  );
}

export class LocalDataStore {
  private databasePromise: Promise<IDBPDatabase<KkaeddakLocalDatabase>> | null =
    null;

  private mode: LocalStorageMode = "persistent";

  private readonly memory = {
    "health-inputs": new Map<string, HealthInputRecord>(),
    "wake-events": new Map<string, WakeEventRecord>(),
    "wake-model": new Map<string, WakeModelRecord>(),
  };

  constructor(private readonly openDatabase: OpenDatabase = openLocalDatabase) {}

  async resolveMode(): Promise<LocalStorageMode> {
    await this.getDatabase();
    return this.mode;
  }

  getMode(): LocalStorageMode {
    return this.mode;
  }

  async put<StoreName extends LocalStoreName>(
    storeName: StoreName,
    value: LocalRecordMap[StoreName],
  ): Promise<void> {
    const database = await this.getDatabase();

    if (database) {
      try {
        await database.put(storeName, value);
        return;
      } catch {
        this.fallBackToMemory();
      }
    }

    const memoryStore = this.memory[storeName] as Map<
      string,
      LocalRecordMap[StoreName]
    >;
    memoryStore.set(value.id, value);
  }

  async getAll<StoreName extends LocalStoreName>(
    storeName: StoreName,
  ): Promise<Array<LocalRecordMap[StoreName]>> {
    const database = await this.getDatabase();

    if (database) {
      try {
        return (await database.getAll(storeName)) as Array<
          LocalRecordMap[StoreName]
        >;
      } catch {
        this.fallBackToMemory();
      }
    }

    const memoryStore = this.memory[storeName] as Map<
      string,
      LocalRecordMap[StoreName]
    >;
    return Array.from(memoryStore.values());
  }

  async clearAll(): Promise<void> {
    for (const storeName of LOCAL_STORE_NAMES) {
      this.memory[storeName].clear();
    }

    const database = await this.getDatabase();
    if (!database) {
      return;
    }

    try {
      const transaction = database.transaction(LOCAL_STORE_NAMES, "readwrite");
      await Promise.all([
        ...LOCAL_STORE_NAMES.map((storeName) =>
          transaction.objectStore(storeName).clear(),
        ),
        transaction.done,
      ]);
    } catch {
      this.fallBackToMemory();
    }
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }

  private async getDatabase() {
    if (this.mode === "ephemeral") {
      return null;
    }

    this.databasePromise ??= this.openDatabase();

    try {
      return await this.databasePromise;
    } catch {
      this.fallBackToMemory();
      return null;
    }
  }

  private fallBackToMemory() {
    this.mode = "ephemeral";
    this.databasePromise = null;
  }
}

export const localDataStore = new LocalDataStore();
