import { describe, expect, it } from "vitest";

import type { WakeResult } from "@/features/current-flow/model/current-flow-store";

import {
  createWakeOutcomeIdempotencyKey,
  createWakeOutcomePayload,
} from "./wake-outcome-api";

const result: WakeResult = {
  alarmStepsUsed: 2,
  completedAt: "2026-09-18T23:05:00.000Z",
  confirmedAt: "2026-09-18T23:05:00.000Z",
  outcome: "CONFIRMED_LATE",
  planId: "00000000-0000-4000-8000-000000000030",
  userCorrection: true,
};

describe("wake outcome API contract", () => {
  it("only sends the opted-in aggregate outcome fields", () => {
    expect(
      createWakeOutcomePayload({
        ...result,
        rawHealthData: { sleepDuration: 300 },
      } as WakeResult),
    ).toEqual({
      alarmStepsUsed: 2,
      confirmedAt: "2026-09-18T23:05:00.000Z",
      consentVersion: "frontend-v1",
      outcome: "CONFIRMED_LATE",
      planId: result.planId,
      userCorrection: true,
    });
  });

  it("keeps retries on the same idempotency key", () => {
    expect(createWakeOutcomeIdempotencyKey(result)).toBe(
      createWakeOutcomeIdempotencyKey({ ...result }),
    );
  });
});
