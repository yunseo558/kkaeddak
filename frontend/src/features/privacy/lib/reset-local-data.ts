import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { useServiceStore } from "@/features/service/model/service-store";
import { stopAlarmSound } from "@/features/service/lib/alarm-audio";
import {
  localDataStore,
  type LocalDataStore,
} from "@/lib/storage/local-data";

export async function resetLocalData(
  storage: Pick<LocalDataStore, "clearAll"> = localDataStore,
): Promise<void> {
  await storage.clearAll();
  stopAlarmSound();
  useServiceStore.getState().reset();
  useServiceStore.persist.clearStorage();

  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
  useCurrentFlowStore.persist.clearStorage();
  useDemoSessionStore.persist.clearStorage();
}
