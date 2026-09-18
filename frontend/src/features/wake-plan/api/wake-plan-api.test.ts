import type { components } from "@kkaeddak/api-client";
import { describe, expect, it } from "vitest";

import {
  createWakePlanDecisionPayload,
  createWakePlanIdempotencyKey,
  createWakePlanPayload,
} from "./wake-plan-api";

const plan: components["schemas"]["WakePlanCreate"] = {
  localDate: "2026-09-19",
  timezone: "Asia/Seoul",
  deadlineAt: "2026-09-18T23:00:00.000Z",
  firstAlarmAt: "2026-09-18T22:50:00.000Z",
  finalAlarmAt: "2026-09-18T23:00:00.000Z",
  importance: "IMPORTANT",
  protocolLevel: 2,
  steps: [
    { order: 1, offsetMin: 0, channel: "WATCH_HAPTIC" },
    { order: 2, offsetMin: 10, channel: "PHONE_SOUND" },
  ],
  reasonCodes: ["IMPORTANT_EVENT"],
  requiresApproval: false,
  modelVersion: "local-wake-0.1",
};

describe("wake plan API payloads", () => {
  it("creates an allowlisted generated-contract payload", () => {
    expect(
      createWakePlanPayload({
        ...plan,
        sleepDuration: 330,
      } as components["schemas"]["WakePlanCreate"]),
    ).toEqual(plan);
  });

  it("keeps the idempotency key stable for the same local plan", () => {
    expect(createWakePlanIdempotencyKey(plan)).toBe(
      createWakePlanIdempotencyKey({ ...plan }),
    );
    expect(createWakePlanIdempotencyKey(plan)).toMatch(/^wake-plan:/);
  });

  it("only includes edited alarm fields in an edit decision", () => {
    expect(
      createWakePlanDecisionPayload("EDIT", 1, {
        firstAlarmAt: "2026-09-18T22:45:00.000Z",
      }),
    ).toEqual({
      decision: "EDIT",
      revision: 1,
      changes: { firstAlarmAt: "2026-09-18T22:45:00.000Z" },
    });
  });
});
