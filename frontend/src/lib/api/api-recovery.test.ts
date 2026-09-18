import { describe, expect, it } from "vitest";

import {
  apiRetryDelay,
  getApiRecoveryPresentation,
  shouldRetryApiRequest,
} from "./api-recovery";

describe("API recovery policy", () => {
  it.each([
    [401, "session"],
    [403, "consent"],
    [404, "missing"],
    [409, "conflict"],
    [422, "privacy"],
    [429, "rate-limit"],
    [503, "server"],
  ] as const)("maps status %s to %s recovery", (status, kind) => {
    expect(getApiRecoveryPresentation({ status }).kind).toBe(kind);
  });

  it("only retries transient responses with bounded exponential delay", () => {
    expect(shouldRetryApiRequest(0, { status: 503 })).toBe(true);
    expect(shouldRetryApiRequest(2, { status: 503 })).toBe(false);
    expect(shouldRetryApiRequest(0, { status: 409 })).toBe(false);
    expect([apiRetryDelay(0), apiRetryDelay(1), apiRetryDelay(8)]).toEqual([
      1_000, 2_000, 8_000,
    ]);
  });
});
