import { describe, it, expect } from "vitest";
import {
  automationEligibility,
  addDays,
  mergeAlarmOffsetsWithSafety,
  type DailyOutcome,
} from "./service-policy";

const records: DailyOutcome[] = Array.from({ length: 12 }, (_, i) => ({
  date: addDays("2026-09-01", i),
  outcome: "CONFIRMED_ON_TIME",
  source: "observed",
}));
const base = {
  enrolledAt: "2026-09-01T00:00:00Z",
  now: "2026-09-15T12:00:00Z",
  consent: true,
  records,
  importance: "NORMAL",
  requiresApproval: false,
};
describe("automation readiness", () => {
  it("requires elapsed time and consent rather than just a preview flag", () => {
    expect(automationEligibility(base).automatic).toBe(true);
    expect(
      automationEligibility({ ...base, now: "2026-09-10T00:00:00Z" }).automatic,
    ).toBe(false);
    expect(automationEligibility({ ...base, consent: false }).automatic).toBe(
      false,
    );
  });
  it("allows an explicit early override while keeping human-loop available", () => {
    expect(
      automationEligibility({
        ...base,
        now: "2026-09-05T00:00:00Z",
        earlyOverride: true,
      }).automatic,
    ).toBe(true);
    expect(
      automationEligibility({
        ...base,
        now: "2026-09-05T00:00:00Z",
        earlyOverride: true,
        consent: false,
      }).automatic,
    ).toBe(false);
  });
  it("keeps important and uncertain plans under approval", () => {
    expect(
      automationEligibility({ ...base, importance: "IMPORTANT" }).automatic,
    ).toBe(false);
    expect(
      automationEligibility({ ...base, requiresApproval: true }).automatic,
    ).toBe(false);
  });
  it("counts distinct dates, excludes future entries and gates recent failures", () => {
    expect(
      automationEligibility({ ...base, records: Array(12).fill(records[0]) })
        .automatic,
    ).toBe(false);
    expect(
      automationEligibility({
        ...base,
        records: records.map((r) => ({ ...r, date: "2027-01-01" })),
      }).automatic,
    ).toBe(false);
    expect(
      automationEligibility({
        ...base,
        records: records.map((r, i) => ({
          ...r,
          outcome: i > 9 ? "UNCONFIRMED" : r.outcome,
        })),
      }).automatic,
    ).toBe(false);
  });
});

describe("alarm safety guard", () => {
  it("keeps the AI plan when it meets the local safety floor", () => {
    expect(mergeAlarmOffsetsWithSafety([0, 12, 25], [0, 10, 20], true)).toEqual([
      0, 12, 25,
    ]);
  });

  it("adds the learned safety count and span when the AI plan is weaker", () => {
    expect(mergeAlarmOffsetsWithSafety([0, 10], [0, 10, 20], true)).toEqual([
      0, 10, 20,
    ]);
  });

  it("leaves a valid AI choice unchanged on a low-risk day", () => {
    expect(mergeAlarmOffsetsWithSafety([0, 8], [0, 10, 20], false)).toEqual([
      0, 8,
    ]);
  });
});
