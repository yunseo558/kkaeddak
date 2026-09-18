import type { WakeResult } from "@/features/current-flow/model/current-flow-store";
import { localDataStore } from "@/lib/storage/local-data";

export async function recordWakeTransition(
  eventType: string,
  planId: string,
  occurredAt = new Date().toISOString(),
) {
  await localDataStore.put("wake-events", {
    id: crypto.randomUUID(),
    eventType,
    occurredAt,
    planId,
  });
}

export async function recordWakeOutcome(
  result: WakeResult,
  localDate: string,
) {
  const id = `outcome:${result.planId}:${result.completedAt}`;
  const events = await localDataStore.getAll("wake-events");
  if (events.some((event) => event.id === id)) {
    return;
  }

  await localDataStore.put("wake-events", {
    id,
    alarmStepsUsed: result.alarmStepsUsed,
    confirmedAt: result.confirmedAt,
    eventType: "OUTCOME_RECORDED",
    localDate,
    occurredAt: result.completedAt,
    outcome: result.outcome,
    planId: result.planId,
    userCorrection: result.userCorrection,
  });
}
