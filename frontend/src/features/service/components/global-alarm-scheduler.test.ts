import { describe, expect, it } from "vitest";

import { isAlarmDue } from "./global-alarm-scheduler";

const plan = {
  id: "plan-1",
  status: "APPROVED",
  firstAlarmAt: "2026-09-21T00:00:00.000Z",
  finalAlarmAt: "2026-09-21T00:20:00.000Z",
};

describe("isAlarmDue", () => {
  it("keeps an overdue alarm eligible beyond the old 30-second window", () => {
    expect(isAlarmDue(plan, "2026-09-21T00:03:00.000Z", null)).toBe(true);
  });

  it("does not fire the same plan twice", () => {
    expect(isAlarmDue(plan, "2026-09-21T00:03:00.000Z", "plan-1")).toBe(false);
  });

  it("does not revive a stale alarm after its grace period", () => {
    expect(isAlarmDue(plan, "2026-09-21T05:00:00.000Z", null)).toBe(false);
  });
});
