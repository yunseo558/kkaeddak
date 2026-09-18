import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import {
  localDataStore,
  type LocalDataStore,
} from "@/lib/storage/local-data";

export async function resetLocalData(
  storage: Pick<LocalDataStore, "clearAll"> = localDataStore,
): Promise<void> {
  await storage.clearAll();

  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
  useCurrentFlowStore.persist.clearStorage();
  useDemoSessionStore.persist.clearStorage();
}
